import { z } from "zod";
import { isQuotationStatus } from "./quotation-status";

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

/**
 * Query for the three quotation list endpoints.
 *
 * `page`, `pageSize` and `limit` are deliberately **optional with no defaults**.
 * `validateQuery` replaces req.query with the parsed result, so a default here
 * would make every request indistinguishable from an explicitly paginated one —
 * and three live frontend pages consume these endpoints as a bare array. The
 * service applies the defaults once it has decided the caller wants a page.
 *
 * `limit` is an accepted alias for `pageSize`; when both are given `pageSize` wins.
 */
export const QuotationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z
    .enum(["createdAt", "-createdAt", "totalPrice", "-totalPrice", "status", "-status"])
    .default("-createdAt"),
  status: z
    .string()
    .refine(isQuotationStatus, "must be a valid quotation status")
    .optional(),
});

export type QuotationListQuery = z.infer<typeof QuotationListQuerySchema>;
