import crypto from "crypto";
import path from "path";
import { In } from "typeorm";
import { AppDataSource } from "../../config/database";
import { assignmentService } from "../assignments/assignment.service";
import { AppError, HttpError } from "../../utils/http-error";
import {
  buildLocalDownloadUrl,
  buildLocalUploadUrl,
  createDocumentStorageKey,
  createUploadPost,
  getDownloadUrl,
  getObjectRange,
  headObject,
  putObject,
  removeLocalDocument,
} from "../../utils/s3";
import { magicBytesMatch, MAGIC_BYTE_PREFIX_LENGTH } from "../../utils/magic-bytes";
import { DocumentStatusHistoryEntity } from "../../entities/document-status-history.entity";
import { ServiceEntity } from "../../entities/service.entity";
import { QuotationEntity } from "../quotations/quotation.entity";
import { QuotationItemEntity } from "../../entities/quotation-item.entity";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { PackageEntity } from "../packages/package.entity";
import { toPublicUser, type PublicUser } from "../../utils/serialize-user";
import { notify, type NotificationType } from "../notifications/notify.service";
import { webUrlFor } from "../../utils/web-url";
import { Locale, pickLocale } from "../../utils/i18n";
import { UserRole, UserEntity } from "../users/user.entity";
import { DocumentEntity } from "./document.entity";
import { DocumentVersionEntity, type DocumentVersionKind } from "./document-version.entity";
import { DocumentPhaseEntity } from "./document-phase.entity";
import { PhaseStatus } from "./phase-status";
import { ServiceRequiredDocumentEntity } from "./service-required-document.entity";
import { canUploadDocuments } from "./entitlement";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_UPLOAD_TYPES,
  isAllowedForRequirement,
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
} from "./upload-constraints";
import {
  assertDocumentStatusTransition,
  canMutateDocumentStatus,
  DocumentStatus,
  getDocumentStatusContract,
} from "./document-status";

/** Who is asking, as resolved by `authenticate` from the database row. */
export interface DocumentActor {
  id: string;
  role: UserRole;
}

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
  contentType: string;
  serviceId?: string;
  requirementId?: string;
  /** Staff only: upload a brand-new document on behalf of this customer. */
  customerId?: string;
}

export interface CreateVersionIntentInput {
  fileName: string;
  contentType: string;
  /** Staff only: 'staff_on_behalf' (acts as the customer) or 'official' (approved file). */
  kind?: DocumentVersionKind;
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

const INTENT_TTL_MS = 15 * 60 * 1000;
const STAFF_ROLES = [UserRole.Agent, UserRole.Manager, UserRole.Admin];

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
}

function documentRepo() {
  return AppDataSource.getRepository(DocumentEntity);
}
function versionRepo() {
  return AppDataSource.getRepository(DocumentVersionEntity);
}
function phaseRepo() {
  return AppDataSource.getRepository(DocumentPhaseEntity);
}

export interface PhaseProgress {
  completed: number;
  total: number;
  percent: number;
}

export function serializePhase(phase: DocumentPhaseEntity) {
  return {
    id: phase.id,
    documentId: phase.documentId,
    position: phase.position,
    nameEn: phase.nameEn,
    nameEs: phase.nameEs,
    department: phase.department ?? null,
    targetDate: phase.targetDate ?? null,
    status: phase.status,
    completedAt: phase.completedAt ?? null,
    completedBy: phase.completedBy ?? null,
    note: phase.note ?? null,
    resultVersionId: phase.resultVersionId ?? null,
    createdAt: phase.createdAt,
    updatedAt: phase.updatedAt,
  };
}

/** Phases for a document, ordered by position. */
export async function listPhasesForDocument(documentId: string): Promise<DocumentPhaseEntity[]> {
  return phaseRepo().find({ where: { documentId }, order: { position: "ASC" } });
}

/** Progress = completed phases / total phases (0 phases → 0%). */
export function computePhaseProgress(phases: DocumentPhaseEntity[]): PhaseProgress {
  const total = phases.length;
  const completed = phases.filter((p) => p.status === PhaseStatus.Completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

/**
 * Which version kinds the owning customer may download. The official approved file (once
 * the document is approved) and the per-phase result files (§11.6); never staff-on-behalf
 * uploads. The caller has already proven ownership via `assertCanReadDocument`.
 */
function customerMayDownload(version: DocumentVersionEntity, document: DocumentEntity): boolean {
  if (version.kind === "official") return document.status === DocumentStatus.Approved;
  if (version.kind === "phase_result") return version.status === "ready";
  return false;
}

function versionStorageKey(documentId: string, kind: DocumentVersionKind, fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return `documents/${documentId}/${kind}-${crypto.randomUUID()}${ext}`;
}

async function requireDocument(documentId: string): Promise<DocumentEntity> {
  const document = await documentRepo().findOne({ where: { id: documentId } });
  if (!document) throw new HttpError(404, "Document not found");
  return document;
}

async function requireVersion(documentId: string, versionId: string): Promise<DocumentVersionEntity> {
  const version = await versionRepo().findOne({ where: { id: versionId } });
  if (!version || version.documentId !== documentId) throw new HttpError(404, "Document version not found");
  return version;
}

/** The single place that decides whether `actor` may see `document`. */
async function assertCanReadDocument(document: DocumentEntity, actor: DocumentActor): Promise<void> {
  if (actor.role === UserRole.Customer) {
    if (document.customerId !== actor.id) throw new HttpError(403, "Forbidden");
    return;
  }
  if (actor.role === UserRole.Manager || actor.role === UserRole.Admin) return;
  if (actor.role === UserRole.Agent) {
    if (!(await assignmentService.isAssigned(actor.id, document.customerId))) throw new HttpError(403, "Forbidden");
    return;
  }
  throw new HttpError(403, "Forbidden");
}

/** Staff scoped to a customer they may act for (assignment check for agents). */
async function assertStaffForCustomer(actor: DocumentActor, customerId: string): Promise<void> {
  if (!isStaff(actor.role)) throw new HttpError(403, "Forbidden");
  if (actor.role === UserRole.Agent && !(await assignmentService.isAssigned(actor.id, customerId))) {
    throw new HttpError(403, "Forbidden");
  }
}

async function nextVersionNo(documentId: string): Promise<number> {
  const versions = await versionRepo().find({ where: { documentId } });
  return versions.reduce((max, v) => Math.max(max, v.versionNo), 0) + 1;
}

async function latestReadyVersion(documentId: string, official: boolean): Promise<DocumentVersionEntity | null> {
  const versions = await versionRepo().find({ where: { documentId, status: "ready" } });
  const matching = versions.filter((v) => (official ? v.kind === "official" : v.kind !== "official"));
  if (matching.length === 0) return null;
  return matching.sort((a, b) => b.versionNo - a.versionNo)[0];
}

function serializeVersion(v: DocumentVersionEntity) {
  return {
    id: v.id,
    versionNo: v.versionNo,
    kind: v.kind,
    fileName: v.fileName,
    mimeType: v.mimeType ?? null,
    sizeBytes: v.sizeBytes != null ? Number(v.sizeBytes) : null,
    uploadedBy: v.uploadedBy ?? null,
    uploadedByRole: v.uploadedByRole,
    status: v.status,
    createdAt: v.createdAt,
  };
}

async function normalizeDocument(document: DocumentEntity) {
  const downloadUrl = (await getDownloadUrl({ key: document.s3Key })) ?? buildLocalDownloadUrl(document.id);
  const approvedDownloadUrl = document.approvedS3Key
    ? (await getDownloadUrl({ key: document.approvedS3Key })) ?? `${buildLocalDownloadUrl(document.id)}?version=approved`
    : null;

  return {
    id: document.id,
    customerId: document.customerId,
    serviceId: document.serviceId ?? null,
    requirementId: document.requirementId ?? null,
    fileName: document.fileName,
    s3Key: document.s3Key,
    currentVersionId: document.currentVersionId ?? null,
    approvedFileName: document.approvedFileName ?? null,
    approvedS3Key: document.approvedS3Key ?? null,
    approvedUploadedBy: document.approvedUploadedBy ?? null,
    approvedUploadedAt: document.approvedUploadedAt ?? null,
    status: document.status,
    expiresAt: document.expiresAt ?? null,
    targetDate: document.targetDate ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    downloadUrl,
    previewUrl: downloadUrl,
    approvedDownloadUrl,
    approvedPreviewUrl: approvedDownloadUrl,
  };
}

/** Builds the presigned POST (S3) or a local upload URL for a pending version. */
async function buildUploadTarget(document: DocumentEntity, version: DocumentVersionEntity) {
  const post = await createUploadPost({
    key: version.storageKey,
    contentType: version.mimeType ?? "application/octet-stream",
    maxBytes: MAX_UPLOAD_BYTES,
  });
  if (post) {
    return { uploadMode: "s3" as const, versionId: version.id, upload: { method: "POST", url: post.url, fields: post.fields } };
  }
  return {
    uploadMode: "local" as const,
    versionId: version.id,
    upload: { method: "POST", url: `${buildLocalUploadUrl(document.id)}/versions/${version.id}`, fields: {} },
  };
}

/** The lock rule: who may add which kind of version, and from which status. */
function assertCanCreateVersion(document: DocumentEntity, actor: DocumentActor, kind: DocumentVersionKind): void {
  if (kind === "official") {
    if (!isStaff(actor.role)) throw new HttpError(403, "Only staff may upload an official file");
    if (document.status !== DocumentStatus.SubmittedToGovernment) {
      throw new AppError(
        "DOCUMENT_LOCKED",
        409,
        `An official file can only be uploaded once the document is submitted_to_government (currently ${document.status}).`,
      );
    }
    return;
  }

  // customer / staff_on_behalf behave the same: a submission the customer owns.
  const allowed = document.status === DocumentStatus.Pending || document.status === DocumentStatus.Rejected;
  if (!allowed) {
    throw new AppError(
      "DOCUMENT_LOCKED",
      409,
      `A new version can only be added while the document is pending or rejected (currently ${document.status}).`,
    );
  }
}

async function validateUploadType(mimeType: string, fileName: string, requirementId?: string | null): Promise<void> {
  if (!isAllowedUpload(mimeType, fileName)) {
    throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, `Unsupported file type. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}`);
  }
  if (requirementId) {
    const requirement = await AppDataSource.getRepository(ServiceRequiredDocumentEntity).findOne({ where: { id: requirementId } });
    if (requirement && !isAllowedForRequirement(mimeType, requirement.allowedMimeTypes)) {
      throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, "This requirement does not accept that file type");
    }
  }
}

function emailTypeForStatus(status: DocumentStatus): NotificationType {
  if (status === DocumentStatus.Approved) return "document_approved";
  if (status === DocumentStatus.Rejected) return "document_rejected";
  return "document_status_changed";
}

export const documentService = {
  getStatusContract() {
    return getDocumentStatusContract();
  },

  canMutateDocumentStatus,

  async listAdminDocuments(query: AdminDocumentListQuery) {
    assertDatabaseReady();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };
    const [documents, total] = await documentRepo().findAndCount({
      where,
      order: { updatedAt: "DESC" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      data: await Promise.all(documents.map(normalizeDocument)),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  },

  async listReviewDocuments(actor: DocumentActor, status?: string) {
    assertDatabaseReady();
    const scope = await assignmentService.customerScopeFor(actor);
    if (scope !== null && scope.length === 0) return [];
    const documents = await documentRepo().find({
      where: {
        ...(status ? { status: status as DocumentStatus } : {}),
        ...(scope ? { customerId: In(scope) } : {}),
      },
      order: { updatedAt: "DESC" },
    });
    const normalized = await Promise.all(documents.map(normalizeDocument));

    // Attach the customer's display name so the staff queue shows a person, not a UUID.
    // One batched read over the distinct customer ids, never a per-row query.
    const customerIds = [...new Set(normalized.map((d) => d.customerId))];
    const customers = customerIds.length
      ? await AppDataSource.getRepository(UserEntity).find({
          where: { id: In(customerIds) },
          select: ["id", "name", "email"],
        })
      : [];
    const nameById = new Map(customers.map((c) => [c.id, c.name || c.email]));
    return normalized.map((d) => ({ ...d, customerName: nameById.get(d.customerId) ?? null }));
  },

  async getDocument(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    // Phases and progress travel with the single-document read (PROJECT-BRIEF §11.5/§11.6).
    // Left out of the list views to avoid a phase query per row.
    const phases = await listPhasesForDocument(documentId);
    return {
      ...(await normalizeDocument(document)),
      phases: phases.map(serializePhase),
      progress: computePhaseProgress(phases),
    };
  },

  async listVersions(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    const versions = await versionRepo().find({ where: { documentId, status: "ready" } });
    // Customers never see the internal staff-on-behalf uploads, but they do see their own
    // submissions, the official result, and the per-phase result files (§11.6 visibility).
    const visible =
      actor.role === UserRole.Customer
        ? versions.filter((v) => v.kind !== "staff_on_behalf")
        : versions;
    return visible.sort((a, b) => a.versionNo - b.versionNo).map(serializeVersion);
  },

  async getCustomerDocuments(customerId: string) {
    assertDatabaseReady();
    const documents = await documentRepo().find({ where: { customerId }, order: { createdAt: "DESC" } });
    return Promise.all(documents.map(normalizeDocument));
  },

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
      changedBy: row.changedByUser ? toPublicUser(row.changedByUser) : null,
    }));
  },

  // ── Upload pipeline ─────────────────────────────────────────────────────────

  /**
   * Creates a new document (pending) and issues an upload target for its first
   * version. Customers upload for themselves; staff may pass `customerId` to upload
   * on a customer's behalf (kind=staff_on_behalf).
   */
  async createUploadTarget(actor: DocumentActor, input: CreateDocumentUploadInput) {
    assertDatabaseReady();

    const customerId = actor.role === UserRole.Customer ? actor.id : input.customerId;
    if (!customerId) throw new HttpError(400, "customerId is required when staff upload on behalf of a customer");
    if (actor.role !== UserRole.Customer) await assertStaffForCustomer(actor, customerId);

    const safeFileName = sanitizeFileName(input.fileName);
    if (!safeFileName || safeFileName === "." || safeFileName === "..") {
      throw new HttpError(400, "File name must contain at least one supported character");
    }
    await validateUploadType(input.contentType, safeFileName, input.requirementId);

    if (input.serviceId) {
      const service = await AppDataSource.getRepository(ServiceEntity).findOne({ where: { id: input.serviceId, isActive: true } });
      if (!service) throw new HttpError(400, "Selected service is not available");
    }
    if (!canUploadDocuments(customerId, input.serviceId ?? null)) {
      throw new AppError("NOT_ENTITLED", 403, "You are not entitled to upload documents for this service yet");
    }

    const document = await documentRepo().save(
      documentRepo().create({
        customerId,
        fileName: safeFileName,
        s3Key: "",
        status: DocumentStatus.Pending,
        serviceId: input.serviceId ?? null,
        requirementId: input.requirementId ?? null,
        expiresAt: null,
      }),
    );

    const kind: DocumentVersionKind = actor.role === UserRole.Customer ? "customer" : "staff_on_behalf";
    const version = await versionRepo().save(
      versionRepo().create({
        documentId: document.id,
        versionNo: 1,
        kind,
        storageKey: versionStorageKey(document.id, kind, safeFileName),
        fileName: safeFileName,
        mimeType: input.contentType,
        uploadedBy: actor.id,
        uploadedByRole: actor.role,
        status: "intent",
        intentExpiresAt: new Date(Date.now() + INTENT_TTL_MS),
      }),
    );

    return { document: await normalizeDocument(document), ...(await buildUploadTarget(document, version)) };
  },

  /** Issues an upload target for a NEW version of an existing document. */
  async createVersionIntent(actor: DocumentActor, documentId: string, input: CreateVersionIntentInput) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);

    let kind: DocumentVersionKind;
    if (actor.role === UserRole.Customer) {
      kind = "customer";
    } else {
      kind = input.kind === "official" ? "official" : "staff_on_behalf";
    }

    assertCanCreateVersion(document, actor, kind);

    const safeFileName = sanitizeFileName(input.fileName);
    if (!safeFileName || safeFileName === "." || safeFileName === "..") {
      throw new HttpError(400, "File name must contain at least one supported character");
    }
    await validateUploadType(input.contentType, safeFileName, document.requirementId);
    if (!canUploadDocuments(document.customerId, document.serviceId ?? null)) {
      throw new AppError("NOT_ENTITLED", 403, "You are not entitled to upload documents for this service yet");
    }

    const version = await versionRepo().save(
      versionRepo().create({
        documentId: document.id,
        versionNo: await nextVersionNo(document.id),
        kind,
        storageKey: versionStorageKey(document.id, kind, safeFileName),
        fileName: safeFileName,
        mimeType: input.contentType,
        uploadedBy: actor.id,
        uploadedByRole: actor.role,
        status: "intent",
        intentExpiresAt: new Date(Date.now() + INTENT_TTL_MS),
      }),
    );

    return buildUploadTarget(document, version);
  },

  /** Local-mode byte sink: stores the file for an intent, then the client confirms. */
  async uploadVersionBytes(actor: DocumentActor, documentId: string, versionId: string, file: LocalDocumentUpload) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    const version = await requireVersion(documentId, versionId);
    if (version.status !== "intent") throw new AppError("UPLOAD_INCOMPLETE", 400, "This version is not awaiting an upload");

    await putObject({ key: version.storageKey, body: file.buffer, contentType: version.mimeType ?? file.mimeType });
    version.mimeType = version.mimeType ?? file.mimeType ?? null;
    version.sizeBytes = String(file.size ?? file.buffer.length);
    await versionRepo().save(version);
    return { versionId: version.id, received: true };
  },

  /**
   * Validates the uploaded bytes (HEAD + size + magic bytes) and, in one
   * transaction, marks the version ready, applies the role transition, writes
   * history, and mirrors the file onto the document. Emails after commit.
   */
  async confirmVersion(actor: DocumentActor, documentId: string, versionId: string) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    const version = await requireVersion(documentId, versionId);

    if (version.status === "ready") return normalizeDocument(document);
    if (version.intentExpiresAt && version.intentExpiresAt.getTime() < Date.now()) {
      throw new AppError("UPLOAD_EXPIRED", 410, "This upload window has expired; request a new one");
    }

    const head = await headObject({ key: version.storageKey });
    if (!head) throw new AppError("UPLOAD_INCOMPLETE", 400, "No uploaded file was found for this version");
    if (head.size <= 0) throw new AppError("UPLOAD_INCOMPLETE", 400, "The uploaded file is empty");
    if (head.size > MAX_UPLOAD_BYTES) {
      throw new AppError("FILE_TOO_LARGE", 413, `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB limit`);
    }

    const declaredMime = version.mimeType ?? head.contentType ?? "application/octet-stream";
    if (!ALLOWED_UPLOAD_TYPES[declaredMime]) {
      throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, "Stored object has a disallowed content type");
    }
    const prefix = await getObjectRange({ key: version.storageKey, end: MAGIC_BYTE_PREFIX_LENGTH });
    if (!prefix || !magicBytesMatch(prefix, declaredMime)) {
      throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, "File contents do not match the declared type");
    }

    const fromStatus = document.status;
    let toStatus = fromStatus;
    if (version.kind === "official") {
      assertDocumentStatusTransition(fromStatus, DocumentStatus.Approved, roleKey(actor.role));
      toStatus = DocumentStatus.Approved;
    } else if (fromStatus === DocumentStatus.Rejected) {
      assertDocumentStatusTransition(fromStatus, DocumentStatus.Pending, actor.role === UserRole.Customer ? "customer" : roleKey(actor.role));
      toStatus = DocumentStatus.Pending;
    }

    await AppDataSource.transaction(async (manager) => {
      version.status = "ready";
      version.sizeBytes = String(head.size);
      version.mimeType = declaredMime;
      await manager.save(DocumentVersionEntity, version);

      if (version.kind === "official") {
        document.approvedFileName = version.fileName;
        document.approvedS3Key = version.storageKey;
        document.approvedUploadedBy = actor.id;
        document.approvedUploadedAt = new Date();
      } else {
        document.currentVersionId = version.id;
        document.fileName = version.fileName;
        document.s3Key = version.storageKey;
      }
      document.status = toStatus;
      await manager.save(DocumentEntity, document);

      await manager.save(DocumentStatusHistoryEntity, {
        documentId: document.id,
        fromStatus,
        toStatus,
        changedBy: actor.id,
        note: `Version ${version.versionNo} (${version.kind}) uploaded`,
      });
    });

    await notify({
      userId: document.customerId,
      type: emailTypeForStatus(toStatus),
      data: { documentName: document.fileName, status: toStatus, note: "", documentUrl: webUrlFor("/dashboard/documents") },
    });

    return normalizeDocument(document);
  },

  /**
   * Single-call official upload (server holds the bytes): stores them, then runs the
   * same confirm path. Fixes the audited defect where this wrote to local disk while
   * downloads presigned S3 (R56/R57).
   */
  async uploadOfficialVersion(actor: DocumentActor, documentId: string, file: LocalDocumentUpload) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    if (!isStaff(actor.role)) throw new HttpError(403, "Only staff may upload an official file");
    assertCanCreateVersion(document, actor, "official");

    const safeName = sanitizeFileName(file.originalName || "official-document.pdf");
    const mimeType = file.mimeType ?? "application/octet-stream";
    await validateUploadType(mimeType, safeName, document.requirementId);

    const version = await versionRepo().save(
      versionRepo().create({
        documentId: document.id,
        versionNo: await nextVersionNo(document.id),
        kind: "official",
        storageKey: versionStorageKey(document.id, "official", safeName),
        fileName: safeName,
        mimeType,
        uploadedBy: actor.id,
        uploadedByRole: actor.role,
        status: "intent",
        intentExpiresAt: new Date(Date.now() + INTENT_TTL_MS),
      }),
    );
    await putObject({ key: version.storageKey, body: file.buffer, contentType: mimeType });
    return this.confirmVersion(actor, documentId, version.id);
  },

  /** Single-call customer/staff upload for an existing document (local convenience). */
  async uploadCustomerVersion(actor: DocumentActor, documentId: string, file: LocalDocumentUpload) {
    assertDatabaseReady();
    const intent = await this.createVersionIntent(actor, documentId, {
      fileName: file.originalName,
      contentType: file.mimeType ?? "application/octet-stream",
    });
    await putObject({ key: (await requireVersion(documentId, intent.versionId)).storageKey, body: file.buffer, contentType: file.mimeType });
    return this.confirmVersion(actor, documentId, intent.versionId);
  },

  // ── Phase result uploads (PROJECT-BRIEF §11.5) ───────────────────────────────
  //
  // A manager uploads the file a phase produced. It reuses the same two-step
  // intent/confirm pipeline and the generic byte sink, but with kind='phase_result'
  // and — unlike 'official' — it never changes the document's own status. The phase
  // side effects (mark completed, link the version) are applied by phase.service.

  /** Issues an upload target for a phase-result file. Staff only. */
  async createPhaseResultIntent(actor: DocumentActor, documentId: string, input: { fileName: string; contentType: string }) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    if (!isStaff(actor.role)) throw new HttpError(403, "Only staff may upload a phase result");

    const safeFileName = sanitizeFileName(input.fileName);
    if (!safeFileName || safeFileName === "." || safeFileName === "..") {
      throw new HttpError(400, "File name must contain at least one supported character");
    }
    await validateUploadType(input.contentType, safeFileName, document.requirementId);

    const version = await versionRepo().save(
      versionRepo().create({
        documentId: document.id,
        versionNo: await nextVersionNo(document.id),
        kind: "phase_result",
        storageKey: versionStorageKey(document.id, "phase_result", safeFileName),
        fileName: safeFileName,
        mimeType: input.contentType,
        uploadedBy: actor.id,
        uploadedByRole: actor.role,
        status: "intent",
        intentExpiresAt: new Date(Date.now() + INTENT_TTL_MS),
      }),
    );

    return buildUploadTarget(document, version);
  },

  /**
   * Validates the uploaded phase-result bytes and marks the version ready. Returns
   * the ready version so phase.service can link it; it does NOT touch the document
   * status or the phase (that is phase.service's transaction).
   */
  async confirmPhaseResultVersion(actor: DocumentActor, documentId: string, versionId: string): Promise<DocumentVersionEntity> {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    if (!isStaff(actor.role)) throw new HttpError(403, "Only staff may upload a phase result");
    const version = await requireVersion(documentId, versionId);
    if (version.kind !== "phase_result") throw new AppError("BAD_REQUEST", 400, "This version is not a phase result");

    if (version.status === "ready") return version;
    if (version.intentExpiresAt && version.intentExpiresAt.getTime() < Date.now()) {
      throw new AppError("UPLOAD_EXPIRED", 410, "This upload window has expired; request a new one");
    }

    const head = await headObject({ key: version.storageKey });
    if (!head) throw new AppError("UPLOAD_INCOMPLETE", 400, "No uploaded file was found for this version");
    if (head.size <= 0) throw new AppError("UPLOAD_INCOMPLETE", 400, "The uploaded file is empty");
    if (head.size > MAX_UPLOAD_BYTES) {
      throw new AppError("FILE_TOO_LARGE", 413, `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB limit`);
    }

    const declaredMime = version.mimeType ?? head.contentType ?? "application/octet-stream";
    if (!ALLOWED_UPLOAD_TYPES[declaredMime]) {
      throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, "Stored object has a disallowed content type");
    }
    const prefix = await getObjectRange({ key: version.storageKey, end: MAGIC_BYTE_PREFIX_LENGTH });
    if (!prefix || !magicBytesMatch(prefix, declaredMime)) {
      throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, "File contents do not match the declared type");
    }

    version.status = "ready";
    version.sizeBytes = String(head.size);
    version.mimeType = declaredMime;
    await versionRepo().save(version);
    return version;
  },

  // ── Downloads ───────────────────────────────────────────────────────────────

  async getVersionDownloadTarget(actor: DocumentActor, documentId: string, versionId: string, options: { inline?: boolean } = {}) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    const version = await requireVersion(documentId, versionId);
    if (version.status !== "ready") throw new AppError("UPLOAD_INCOMPLETE", 400, "This version is not ready");

    if (actor.role === UserRole.Customer && !customerMayDownload(version, document)) {
      throw new AppError("NOT_ENTITLED", 403, "This file is not available to download yet");
    }

    const disposition = options.inline
      ? `inline; filename="${version.fileName}"`
      : `attachment; filename="${version.fileName}"`;
    const signedUrl = await getDownloadUrl({
      key: version.storageKey,
      expiresIn: options.inline ? 300 : 900,
      responseContentDisposition: disposition,
      responseContentType: version.mimeType ?? undefined,
    });

    return {
      downloadMode: signedUrl ? "s3" : "local",
      downloadUrl: signedUrl ?? `${buildLocalDownloadUrl(document.id)}/versions/${version.id}${options.inline ? "?inline=1" : ""}`,
      version: serializeVersion(version),
    };
  },

  /** Resolves a version's local file path for streaming (local mode download route). */
  async getVersionForDownload(actor: DocumentActor, documentId: string, versionId: string) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    const version = await requireVersion(documentId, versionId);
    if (actor.role === UserRole.Customer && !customerMayDownload(version, document)) {
      throw new AppError("NOT_ENTITLED", 403, "This file is not available to download yet");
    }
    return version;
  },

  // ── Legacy download targets (customer-portal UI uses these) ──────────────────

  async getDocumentDownloadTarget(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    const signedUrl = await getDownloadUrl({ key: document.s3Key, responseContentDisposition: `attachment; filename="${document.fileName}"` });
    return { document: await normalizeDocument(document), downloadUrl: signedUrl ?? buildLocalDownloadUrl(document.id), downloadMode: signedUrl ? "s3" : "local" };
  },

  async getApprovedDocumentDownloadTarget(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);
    if (!document.approvedS3Key) throw new HttpError(404, "Approved document version not found");
    if (actor.role === UserRole.Customer && document.status !== DocumentStatus.Approved) {
      throw new AppError("NOT_ENTITLED", 403, "The approved official file is not available yet");
    }
    const signedUrl = await getDownloadUrl({
      key: document.approvedS3Key,
      responseContentDisposition: `attachment; filename="${document.approvedFileName ?? document.fileName}"`,
    });
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

  // ── Status transitions ───────────────────────────────────────────────────────

  async updateDocumentStatus(actor: DocumentActor, documentId: string, input: UpdateDocumentStatusInput, adminOverride = false) {
    assertDatabaseReady();
    if (!canMutateDocumentStatus(actor.role)) throw new HttpError(403, "Forbidden");
    if (adminOverride && actor.role !== UserRole.Admin) throw new HttpError(403, "Only admins may override document status");
    if (input.toStatus === DocumentStatus.Rejected && (input.note?.trim().length ?? 0) < 5) {
      throw new AppError("NOTE_REQUIRED", 400, "A rejection note of at least 5 characters is required");
    }

    const document = await requireDocument(documentId);
    await assertCanReadDocument(document, actor);

    if (input.fromStatus && document.status !== input.fromStatus) throw new HttpError(409, "Document status mismatch");
    if (!adminOverride) assertDocumentStatusTransition(document.status, input.toStatus, roleKey(actor.role));

    const fromStatus = document.status;
    await AppDataSource.transaction(async (manager) => {
      await manager.save(DocumentStatusHistoryEntity, {
        documentId: document.id,
        fromStatus,
        toStatus: input.toStatus,
        changedBy: actor.id,
        note: input.note ?? null,
      });
      document.status = input.toStatus;
      await manager.save(DocumentEntity, document);
    });

    await notify({
      userId: document.customerId,
      type: emailTypeForStatus(input.toStatus),
      data: { documentName: document.fileName, status: input.toStatus, note: input.note ?? "", documentUrl: webUrlFor("/dashboard/documents") },
    });

    return normalizeDocument(document);
  },

  // ── Checklist ─────────────────────────────────────────────────────────────────

  async getChecklist(customerId: string, locale: Locale = "es") {
    assertDatabaseReady();

    const serviceIds = await purchasedServiceIds(customerId);
    if (serviceIds.length === 0) return { services: [], completion: 100, requiredTotal: 0, requiredSubmitted: 0 };

    const requirements = await AppDataSource.getRepository(ServiceRequiredDocumentEntity).find({
      where: { serviceId: In(serviceIds) },
    });
    const services = await AppDataSource.getRepository(ServiceEntity).find({ where: { id: In(serviceIds) } });
    const documents = await documentRepo().find({ where: { customerId } });
    const docByRequirement = new Map<string, DocumentEntity>();
    for (const doc of documents) if (doc.requirementId) docByRequirement.set(doc.requirementId, doc);

    let requiredTotal = 0;
    let requiredSubmitted = 0;

    const serviceBlocks = services
      .map((service) => {
        const reqs = requirements
          .filter((r) => r.serviceId === service.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((r) => {
            const doc = docByRequirement.get(r.id);
            const submitted = Boolean(doc?.currentVersionId);
            if (r.isRequired) {
              requiredTotal += 1;
              if (submitted) requiredSubmitted += 1;
            }
            return {
              id: r.id,
              name: pickLocale(locale, r.nameEn, r.nameEs),
              description: pickLocale(locale, r.descriptionEn, r.descriptionEs),
              isRequired: r.isRequired,
              documentId: doc?.id ?? null,
              status: doc?.status ?? null,
              submitted,
            };
          });
        const serviceRequired = reqs.filter((r) => r.isRequired).length;
        const serviceSubmitted = reqs.filter((r) => r.isRequired && r.submitted).length;
        return {
          serviceId: service.id,
          serviceName: pickLocale(locale, service.nameEn, service.nameEs),
          requirements: reqs,
          completion: serviceRequired === 0 ? 100 : Math.round((serviceSubmitted / serviceRequired) * 100),
        };
      })
      .filter((block) => block.requirements.length > 0);

    return {
      services: serviceBlocks,
      requiredTotal,
      requiredSubmitted,
      completion: requiredTotal === 0 ? 100 : Math.round((requiredSubmitted / requiredTotal) * 100),
    };
  },

  async cleanupLocalDocument(key: string) {
    await removeLocalDocument(key);
  },
};

/** A role as the status overlay keys it. */
function roleKey(role: UserRole): "customer" | "agent" | "manager" | "admin" {
  if (role === UserRole.Agent) return "agent";
  if (role === UserRole.Manager) return "manager";
  if (role === UserRole.Admin) return "admin";
  return "customer";
}

/** Services a customer has purchased: accepted-quotation services ∪ active-subscription package services. */
async function purchasedServiceIds(customerId: string): Promise<string[]> {
  const ids = new Set<string>();

  const acceptedQuotations = await AppDataSource.getRepository(QuotationEntity).find({
    where: { customerId, status: "accepted" },
  });
  if (acceptedQuotations.length > 0) {
    const items = await AppDataSource.getRepository(QuotationItemEntity).find({
      where: { quotationId: In(acceptedQuotations.map((q) => q.id)) },
    });
    for (const item of items) if (item.serviceId) ids.add(item.serviceId);
  }

  const subscriptions = await AppDataSource.getRepository(SubscriptionEntity).find({
    where: { customerId, status: "active" },
  });
  if (subscriptions.length > 0) {
    const packages = await AppDataSource.getRepository(PackageEntity).find({
      where: { id: In(subscriptions.map((s) => s.packageId)) },
      relations: { services: true },
    });
    for (const pkg of packages) for (const service of pkg.services ?? []) ids.add(service.id);
  }

  return [...ids];
}
