import { In } from "typeorm";
import { AppDataSource } from "../../config/database";
import { assignmentService } from "../assignments/assignment.service";
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
import { toPublicUser, type PublicUser } from "../../utils/serialize-user";
import { notify } from "../notifications/notify.service";
import { webUrlFor } from "../../utils/web-url";
import { UserRole } from "../users/user.entity";
import { DocumentEntity } from "./document.entity";
import { ServiceEntity } from "../../entities/service.entity";
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

/** One row of a document's status trail, as it leaves the service. */
export interface DocumentHistoryEntry {
  id: string;
  fromStatus: DocumentStatus | null;
  toStatus: DocumentStatus;
  note: string | null;
  createdAt: Date;
  changedBy: PublicUser | null;
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

export interface AdminDocumentListQuery {
  status?: DocumentStatus;
  customerId?: string;
  page: number;
  pageSize: number;
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

async function resolveApprovedDownloadUrl(document: DocumentEntity): Promise<string | null> {
  if (!document.approvedS3Key) {
    return null;
  }

  const signedUrl = await getDownloadUrl({ key: document.approvedS3Key });
  return signedUrl ?? `${buildLocalDownloadUrl(document.id)}?version=approved`;
}

async function normalizeDocument(document: DocumentEntity) {
  const downloadUrl = await resolveDownloadUrl(document);
  const approvedDownloadUrl = await resolveApprovedDownloadUrl(document);

  return {
    id: document.id,
    customerId: document.customerId,
    serviceId: document.serviceId ?? null,
    fileName: document.fileName,
    s3Key: document.s3Key,
    approvedFileName: document.approvedFileName ?? null,
    approvedS3Key: document.approvedS3Key ?? null,
    approvedUploadedBy: document.approvedUploadedBy ?? null,
    approvedUploadedAt: document.approvedUploadedAt ?? null,
    status: document.status,
    expiresAt: document.expiresAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    downloadUrl,
    previewUrl: downloadUrl,
    approvedDownloadUrl,
    approvedPreviewUrl: approvedDownloadUrl,
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
async function assertCanReadDocument(document: DocumentEntity, actor: DocumentActor): Promise<void> {
  if (actor.role === UserRole.Customer) {
    if (document.customerId !== actor.id) {
      throw new HttpError(403, "Forbidden");
    }

    return;
  }

  // Manager and admin keep organisation-wide visibility. There is no team concept
  // anywhere in the schema to narrow a manager against — no manager_id, no team
  // table, no branch — so narrowing them would have meant inventing one. Recorded
  // in docs/decision-log.md for 2026-10-14.
  if (actor.role === UserRole.Manager || actor.role === UserRole.Admin) {
    return;
  }

  // An agent reads only their assigned customers. A customer assigned to nobody is
  // therefore invisible to every agent, which is deliberate: assigning them is the
  // step that puts their documents into a review queue.
  if (actor.role === UserRole.Agent) {
    if (!(await assignmentService.isAssigned(actor.id, document.customerId))) {
      throw new HttpError(403, "Forbidden");
    }

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

async function assertCanUploadApprovedVersion(document: DocumentEntity, actor: DocumentActor): Promise<void> {
  if (
    actor.role !== UserRole.Agent &&
    actor.role !== UserRole.Manager &&
    actor.role !== UserRole.Admin
  ) {
    throw new HttpError(403, "Forbidden");
  }

  // Delegates the agent-assignment scope rather than repeating the condition, so a
  // reviewer can never write to a document they are forbidden to read.
  await assertCanReadDocument(document, actor);
}

export const documentService = {
  async listAdminDocuments(query: AdminDocumentListQuery) {
    assertDatabaseReady();

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };
    const [documents, total] = await AppDataSource.getRepository(DocumentEntity).findAndCount({
      where,
      order: { updatedAt: "DESC" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      data: await Promise.all(documents.map(normalizeDocument)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },

  async listReviewDocuments(actor: DocumentActor, status?: string) {
    assertDatabaseReady();

    // The same helper the quotation list uses, so the two cannot disagree about
    // what an agent is allowed to see.
    const scope = await assignmentService.customerScopeFor(actor);
    if (scope !== null && scope.length === 0) {
      return [];
    }

    const repository = AppDataSource.getRepository(DocumentEntity);
    const documents = await repository.find({
      where: {
        ...(status ? { status: status as DocumentStatus } : {}),
        ...(scope ? { customerId: In(scope) } : {}),
      },
      order: { updatedAt: "DESC" },
    });

    return Promise.all(documents.map((document) => normalizeDocument(document)));
  },

  canMutateDocumentStatus,

  getNextStatuses: (status: DocumentStatus) => status,

  async createUploadTarget(customerId: string, input: CreateDocumentUploadInput) {
    assertDatabaseReady();

    const documentRepository = AppDataSource.getRepository(DocumentEntity);
    const safeFileName = sanitizeFileName(input.fileName);
  if (!safeFileName || safeFileName === "." || safeFileName === "..") {
    throw new HttpError(400, "File name must contain at least one supported character");
  }
  if (input.serviceId) {
    const service = await AppDataSource.getRepository(ServiceEntity).findOne({ where: { id: input.serviceId, isActive: true } });
    if (!service) throw new HttpError(400, "Selected service is not available");
  }
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
  if (!safeName || safeName === "." || safeName === "..") {
    throw new HttpError(400, "File name must contain at least one supported character");
  }
    const storageKey = document.s3Key || createDocumentStorageKey(safeName);

    await saveLocalDocument(file.buffer, storageKey);

    document.fileName = safeName;
    document.s3Key = storageKey;
    const saved = await AppDataSource.getRepository(DocumentEntity).save(document);

    return normalizeDocument(saved);
  },

  async uploadApprovedDocument(actor: DocumentActor, documentId: string, file: LocalDocumentUpload) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    await assertCanUploadApprovedVersion(document, actor);

    const safeName = sanitizeFileName(file.originalName || "approved-document.pdf");
    if (!safeName || safeName === "." || safeName === "..") {
      throw new HttpError(400, "File name must contain at least one supported character");
    }

    const storageKey = `documents/approved/${document.id}/${crypto.randomUUID()}${safeName.includes(".") ? "" : ".pdf"}`;
    await saveLocalDocument(file.buffer, storageKey);

    document.approvedFileName = safeName;
    document.approvedS3Key = storageKey;
    document.approvedUploadedBy = actor.id;
    document.approvedUploadedAt = new Date();
    document.status = DocumentStatus.Approved;

    const saved = await AppDataSource.getRepository(DocumentEntity).save(document);
    return normalizeDocument(saved);
  },

  async getDocumentDownloadTarget(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);

    const signedUrl = await getDownloadUrl({ key: document.s3Key });

    return {
      document: await normalizeDocument(document),
      downloadUrl: signedUrl ?? buildLocalDownloadUrl(document.id),
      downloadMode: signedUrl ? "s3" : "local",
    };
  },

  async getApprovedDocumentDownloadTarget(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);

    if (!document.approvedS3Key) {
      throw new HttpError(404, "Approved document version not found");
    }

    const signedUrl = await getDownloadUrl({ key: document.approvedS3Key });

    return {
      document: await normalizeDocument(document),
      downloadUrl: signedUrl ?? `${buildLocalDownloadUrl(document.id)}?version=approved`,
      downloadMode: signedUrl ? "s3" : "local",
    };
  },

  async getDocumentLocalPath(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);

    return document;
  },

  /** Detail view. The access rule is the shared one, so reviewers can open it. */
  async getDocument(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);

    return normalizeDocument(document);
  },

  /**
   * The document's full status trail, oldest first.
   *
   * `document_status_history` has been written on every transition since Phase 0
   * and had no endpoint, so the data this returns already exists for every
   * document in the database.
   *
   * The actor on each row is reduced to its public fields. The loaded relation is
   * a `UserEntity` carrying `passwordHash` and `tokensValidFrom`, and returning it
   * as-is is the defect `docs/decision-log.md` records for 2026-10-11.
   */
  async history(actor: DocumentActor, documentId: string): Promise<DocumentHistoryEntry[]> {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);

    const rows = await AppDataSource.getRepository(DocumentStatusHistoryEntity).find({
      where: { documentId },
      relations: { changedByUser: true },
      order: { createdAt: "ASC" },
    });

    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus ?? null,
      toStatus: row.toStatus,
      note: row.note ?? null,
      createdAt: row.createdAt,
      // null for a system transition, such as the expiry cron.
      changedBy: row.changedByUser ? toPublicUser(row.changedByUser) : null,
    }));
  },

  async updateDocumentStatus(actor: DocumentActor, documentId: string, input: UpdateDocumentStatusInput, adminOverride = false) {
    assertDatabaseReady();

    // `authenticate` already read this user's current row, so the role here is
    // authoritative — no second lookup, and no chance of acting on the stale role
    // baked into a token.
    if (!canMutateDocumentStatus(actor.role)) {
      throw new HttpError(403, "Forbidden");
    }
    if (adminOverride && actor.role !== UserRole.Admin) {
      throw new HttpError(403, "Only admins may override document status");
    }
    if (input.toStatus === DocumentStatus.Rejected && (input.note?.trim().length ?? 0) < 5) {
      throw new HttpError(400, "A rejection note of at least 5 characters is required");
    }

    const documentRepository = AppDataSource.getRepository(DocumentEntity);
    const historyRepository = AppDataSource.getRepository(DocumentStatusHistoryEntity);
    const document = await requireDocument(documentId);

    // The write path had no ownership check at all: it gated on role only, so an
    // agent could approve or reject a document they are forbidden to open. Same
    // helper as the reads, so the two agree by construction.
    await assertCanReadDocument(document, actor);

    if (input.fromStatus && document.status !== input.fromStatus) {
      throw new HttpError(409, "Document status mismatch");
    }

    if (!adminOverride) {
      assertDocumentStatusTransition(document.status, input.toStatus);
    }

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

    // Every transition is recorded; only approved/rejected also email the customer.
    const type =
      input.toStatus === DocumentStatus.Approved
        ? "document_approved"
        : input.toStatus === DocumentStatus.Rejected
          ? "document_rejected"
          : "document_status_changed";
    await notify({
      userId: document.customerId,
      type,
      data: { documentName: document.fileName, status: input.toStatus, note: input.note ?? "", documentUrl: webUrlFor("/dashboard/documents") },
    });

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
