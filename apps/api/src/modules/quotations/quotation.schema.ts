import { z } from "zod";

export const QuotationSchema = z.object({
	workerCount: z.number().int().min(1).max(100000),
	locationId: z.string().uuid(),
	serviceIds: z.array(z.string().uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, "serviceIds must be unique").default([]),
	industryId: z.string().uuid(),
});

export const QuotationIdParamSchema = z.object({ id: z.string().uuid("must be a valid quotation id") });
export const QuotationStatusSchema = z.object({
  status: z.enum(["draft", "sent", "under_review", "accepted", "rejected", "expired"]),
  note: z.string().trim().max(1000).optional(),
});
export const QuotationRejectSchema = z.object({ reason: z.string().trim().min(1).max(1000).optional() }).default({});
