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
  contentType: z.string().trim().min(1).max(200),
  serviceId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  // Staff only: upload a new document on behalf of this customer.
  customerId: z.string().uuid().optional(),
});

export const CreateVersionIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(200),
  // Staff may choose the kind; a customer's kind is always 'customer' (ignored here).
  kind: z.enum(["staff_on_behalf", "official"]).optional(),
});

export const VersionIdParamSchema = z.object({
  id: z.string().uuid("must be a valid document id"),
  versionId: z.string().uuid("must be a valid version id"),
});

const documentStatusUpdateShape = {
  // Optional optimistic-concurrency guard: when supplied, the change is rejected
  // with 409 unless the document is still in this status, so two reviewers acting
  // at once cannot silently overwrite each other.
  fromStatus: DocumentStatusSchema.optional(),
  toStatus: DocumentStatusSchema,
  note: z.string().trim().max(1000).optional(),
};

export const UpdateDocumentStatusSchema = z.object(documentStatusUpdateShape).superRefine((input, context) => {
  if (input.toStatus === DocumentStatus.Rejected && (input.note?.trim().length ?? 0) < 5) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["note"],
      message: "A rejection note of at least 5 characters is required",
    });
  }
});

export const AdminUpdateDocumentStatusSchema = z.object({
  ...documentStatusUpdateShape,
  note: z.string().trim().min(5, "A note of at least 5 characters is required").max(1000),
});

export const AdminDocumentListQuerySchema = z.object({
  status: DocumentStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Rejects a non-UUID id before it reaches Postgres, which would otherwise raise
 * `invalid input syntax for type uuid` — a driver error surfacing as a 500 for what
 * is plainly a bad request.
 */
export const DocumentIdParamSchema = z.object({
  id: z.string().uuid("must be a valid document id"),
});
