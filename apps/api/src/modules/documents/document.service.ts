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
import { UserEntity } from "../users/user.entity";
import { DocumentEntity } from "./document.entity";
import {
  assertDocumentStatusTransition,
  canMutateDocumentStatus,
  DocumentStatus,
} from "./document-status";

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

async function requireUser(userId: string): Promise<UserEntity> {
  const repository = AppDataSource.getRepository(UserEntity);
  const user = await repository.findOne({ where: { id: userId } });

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  return user;
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

  async uploadLocalDocument(customerId: string, documentId: string, file: LocalDocumentUpload) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    if (document.customerId !== customerId) {
      throw new HttpError(403, "Forbidden");
    }

    const user = await requireUser(customerId);
    if (user.role !== "customer") {
      throw new HttpError(403, "Forbidden");
    }

    const safeName = sanitizeFileName(file.originalName || document.fileName);
    const storageKey = document.s3Key || createDocumentStorageKey(safeName);

    await saveLocalDocument(file.buffer, storageKey);

    document.fileName = safeName;
    document.s3Key = storageKey;
    const saved = await AppDataSource.getRepository(DocumentEntity).save(document);

    return normalizeDocument(saved);
  },

  async getDocumentDownloadTarget(customerId: string, documentId: string) {
    assertDatabaseReady();

    const document = await requireDocument(documentId);
    if (document.customerId !== customerId) {
      throw new HttpError(403, "Forbidden");
    }

    return {
      document: await normalizeDocument(document),
      downloadUrl: await resolveDownloadUrl(document),
      downloadMode: (await getDownloadUrl({ key: document.s3Key })) ? "s3" : "local",
    };
  },

  async getDocumentLocalPath(customerId: string, documentId: string) {
    const document = await requireDocument(documentId);

    if (document.customerId !== customerId) {
      throw new HttpError(403, "Forbidden");
    }

    return document;
  },

  async updateDocumentStatus(documentId: string, input: UpdateDocumentStatusInput, changedByUserId: string) {
    assertDatabaseReady();

    const user = await requireUser(changedByUserId);
    if (!canMutateDocumentStatus(user.role)) {
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
        changedBy: user.id,
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
