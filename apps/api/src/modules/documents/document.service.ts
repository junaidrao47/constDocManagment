import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import {
  buildLocalDownloadUrl,
  buildLocalUploadUrl,
  createDocumentStorageKey,
  getDownloadUrl,
  getUploadUrl,
  saveLocalDocument,
  removeLocalDocument,
} from "../../utils/s3";
import { DocumentStatusHistoryEntity } from "../../entities/document-status-history.entity";
import { UserRole } from "../users/user.entity";
import { DocumentEntity } from "./document.entity";
import {
  assertDocumentStatusTransition,
  canMutateDocumentStatus,
  DocumentStatus,
} from "./document-status";

/**
 * Who is asking, as resolved by `authenticate` from the database row.
 *
 * Every document operation takes one of these instead of a bare `customerId`. The
 * old signatures could only express "this must be the owner", which is why agents
 * and managers — the people whose job is to review documents — were locked out of
 * reading them.
 */
export interface DocumentActor {
  id: string;
  role: UserRole;
}

export interface CreateDocumentUploadInput {
  fileName: string;
  contentType?: string;
  serviceId?: string;
}

export interface UpdateDocumentStatusInput {
  fromStatus?: DocumentStatus;
  toStatus: DocumentStatus;
  note?: string;
}

export interface LocalDocumentUpload {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  size?: number;
}

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
}

async function resolveDownloadUrl(document: DocumentEntity): Promise<string> {
  const signedUrl = await getDownloadUrl({ key: document.s3Key });
  return signedUrl ?? buildLocalDownloadUrl(document.id);
}

async function normalizeDocument(document: DocumentEntity) {
  const downloadUrl = await resolveDownloadUrl(document);

  return {
    id: document.id,
    customerId: document.customerId,
    serviceId: document.serviceId ?? null,
    fileName: document.fileName,
    s3Key: document.s3Key,
    status: document.status,
    expiresAt: document.expiresAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    downloadUrl,
    previewUrl: downloadUrl,
  };
}

async function requireDocument(documentId: string): Promise<DocumentEntity> {
  const repository = AppDataSource.getRepository(DocumentEntity);
  const document = await repository.findOne({ where: { id: documentId } });

  if (!document) {
    throw new HttpError(404, "Document not found");
  }

  return document;
}

/**
 * The single place that decides whether `actor` may see `document`.
 *
 * One helper rather than a copy of the ownership check in each method, because the
 * previous copies had already diverged — and Phase 4 adds agent-to-customer
 * assignment scoping, which must land in exactly one place to be trustworthy.
 *
 * Customers see only their own. Staff see everything for now; narrowing agents to
 * their assigned customers needs the assignment table, which does not exist yet.
 * That is a deliberate, dated gap rather than an oversight.
 */
function assertCanReadDocument(document: DocumentEntity, actor: DocumentActor): void {
  if (actor.role === UserRole.Customer) {
    if (document.customerId !== actor.id) {
      throw new HttpError(403, "Forbidden");
    }

    return;
  }

  if (
    actor.role === UserRole.Agent ||
    actor.role === UserRole.Manager ||
    actor.role === UserRole.Admin
  ) {
    // TODO(phase-4): once assignments exist, an agent must be limited to documents
    // belonging to customers assigned to them.
    return;
  }

  throw new HttpError(403, "Forbidden");
}

/**
 * Writing the file itself is the owner's act alone.
 *
 * Reviewers may read a document and change its status; letting them replace the
 * bytes would destroy the thing under review and leave no trace of the original.
 */
function assertCanWriteDocumentFile(document: DocumentEntity, actor: DocumentActor): void {
  if (actor.role !== UserRole.Customer || document.customerId !== actor.id) {
    throw new HttpError(403, "Forbidden");
  }
}

export const documentService = {
  canMutateDocumentStatus,

  getNextStatuses: (status: DocumentStatus) => status,

  async createUploadTarget(customerId: string, input: CreateDocumentUploadInput) {
    assertDatabaseReady();

    const documentRepository = AppDataSource.getRepository(DocumentEntity);
    const safeFileName = sanitizeFileName(input.fileName);
    const s3Key = createDocumentStorageKey(safeFileName);

    const document = await documentRepository.save(
      documentRepository.create({
        customerId,
        fileName: safeFileName,
        s3Key,
        status: DocumentStatus.Pending,
        serviceId: input.serviceId ?? null,
        expiresAt: null,
      }),
    );

    const uploadUrl = await getUploadUrl({ key: s3Key, contentType: input.contentType });

    return {
      document: await normalizeDocument(document),
      uploadMode: uploadUrl ? "s3" : "local",
      uploadUrl: uploadUrl ?? buildLocalUploadUrl(document.id),
      uploadMethod: uploadUrl ? "PUT" : "POST",
      uploadHeaders: uploadUrl ? { "Content-Type": input.contentType ?? "application/octet-stream" } : undefined,
    };
  },

  async uploadLocalDocument(actor: DocumentActor, documentId: string, file: LocalDocumentUpload) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    assertCanWriteDocumentFile(document, actor);

    const safeName = sanitizeFileName(file.originalName || document.fileName);
    const storageKey = document.s3Key || createDocumentStorageKey(safeName);

    await saveLocalDocument(file.buffer, storageKey);

    document.fileName = safeName;
    document.s3Key = storageKey;
    const saved = await AppDataSource.getRepository(DocumentEntity).save(document);

    return normalizeDocument(saved);
  },

  async getDocumentDownloadTarget(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    assertCanReadDocument(document, actor);

    const signedUrl = await getDownloadUrl({ key: document.s3Key });

    return {
      document: await normalizeDocument(document),
      downloadUrl: signedUrl ?? buildLocalDownloadUrl(document.id),
      downloadMode: signedUrl ? "s3" : "local",
    };
  },

  async getDocumentLocalPath(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    assertCanReadDocument(document, actor);

    return document;
  },

  /** Detail view. The access rule is the shared one, so reviewers can open it. */
  async getDocument(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    assertCanReadDocument(document, actor);

    return normalizeDocument(document);
  },

  async updateDocumentStatus(actor: DocumentActor, documentId: string, input: UpdateDocumentStatusInput) {
    assertDatabaseReady();

    // `authenticate` already read this user's current row, so the role here is
    // authoritative — no second lookup, and no chance of acting on the stale role
    // baked into a token.
    if (!canMutateDocumentStatus(actor.role)) {
      throw new HttpError(403, "Forbidden");
    }

    const documentRepository = AppDataSource.getRepository(DocumentEntity);
    const historyRepository = AppDataSource.getRepository(DocumentStatusHistoryEntity);
    const document = await requireDocument(documentId);

    if (input.fromStatus && document.status !== input.fromStatus) {
      throw new HttpError(409, "Document status mismatch");
    }

    assertDocumentStatusTransition(document.status, input.toStatus);

    await historyRepository.save(
      historyRepository.create({
        documentId: document.id,
        fromStatus: document.status,
        toStatus: input.toStatus,
        changedBy: actor.id,
        note: input.note ?? null,
      }),
    );

    document.status = input.toStatus;
    const savedDocument = await documentRepository.save(document);

    return normalizeDocument(savedDocument);
  },

  async getCustomerDocuments(customerId: string) {
    assertDatabaseReady();

    const documentRepository = AppDataSource.getRepository(DocumentEntity);
    const documents = await documentRepository.find({
      where: { customerId },
      order: { createdAt: "DESC" },
    });

    return Promise.all(documents.map((document) => normalizeDocument(document)));
  },

  async cleanupLocalDocument(key: string) {
    await removeLocalDocument(key);
  },
};
