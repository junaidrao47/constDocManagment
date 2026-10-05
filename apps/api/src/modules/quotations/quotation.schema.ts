import { z } from "zod";

export const QuotationSchema = z.object({
	workerCount: z.number().int().min(1).max(100000),
	locationId: z.string().uuid(),
	serviceIds: z.array(z.string().uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, "serviceIds must be unique").default([]),
	industryId: z.string().uuid(),
});

export const QuotationIdParamSchema = z.object({ id: z.string().uuid("must be a valid quotation id") });
export const QuotationStatusSchema = z.object({
  status: z.enum(["draft", "sent", "under_review", "accepted", "rejected", "expired", "converted", "cancelled"]),
  note: z.string().trim().max(1000).optional(),
});
export const QuotationRejectSchema = z.object({ reason: z.string().trim().min(1).max(1000).optional() }).default({});

export const ExtraLineSchema = z.object({
  kind: z.enum(["gov_fee", "discount"]),
  label: z.string().trim().min(1, "Label is required"),
  amount: z.number().positive("Amount must be greater than 0"),
});

export const StaffQuotationCreateSchema = z.object({
  customerId: z.string().uuid("must be a valid customer id"),
  industryId: z.string().uuid("must be a valid industry id"),
  locationId: z.string().uuid("must be a valid location id"),
  workerCount: z.number().int().min(1, "Worker count must be at least 1").max(100000),
  serviceIds: z
    .array(z.string().uuid())
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, "serviceIds must be unique")
    .default([]),
  extraLines: z.array(ExtraLineSchema).max(20, "At most 20 extra lines allowed").optional().default([]),
});

export type StaffQuotationCreateInput = z.infer<typeof StaffQuotationCreateSchema>;
