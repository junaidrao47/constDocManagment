import { z } from "zod";

export const DocumentStatusSchema = z.enum([
	"pending",
	"under_review",
	"approved",
	"rejected",
	"expiring_soon",
	"expired",
]);

export const DocumentSchema = z.object({
	fileName: z.string().min(1),
	s3Key: z.string().min(1),
	status: DocumentStatusSchema.default("pending"),
});

export const UpdateDocumentStatusSchema = z.object({
	fromStatus: DocumentStatusSchema.optional(),
	toStatus: DocumentStatusSchema,
	note: z.string().trim().max(1000).optional(),
});
