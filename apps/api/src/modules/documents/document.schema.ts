import { z } from "zod";
import { DocumentStatus } from "./document-status";

/** Derived from the enum, so adding a status cannot leave the schema behind. */
export const DocumentStatusSchema = z.nativeEnum(DocumentStatus);

export const DocumentSchema = z.object({
  fileName: z.string().min(1),
  s3Key: z.string().min(1),
  status: DocumentStatusSchema.default(DocumentStatus.Pending),
});

export const CreateDocumentUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(200).optional(),
  serviceId: z.string().uuid().optional(),
});

export const UpdateDocumentStatusSchema = z.object({
  // Optional optimistic-concurrency guard: when supplied, the change is rejected
  // with 409 unless the document is still in this status, so two reviewers acting
  // at once cannot silently overwrite each other.
  fromStatus: DocumentStatusSchema.optional(),
  toStatus: DocumentStatusSchema,
  note: z.string().trim().max(1000).optional(),
});

/**
 * Rejects a non-UUID id before it reaches Postgres, which would otherwise raise
 * `invalid input syntax for type uuid` — a driver error surfacing as a 500 for what
 * is plainly a bad request.
 */
export const DocumentIdParamSchema = z.object({
  id: z.string().uuid("must be a valid document id"),
});
