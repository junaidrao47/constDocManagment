import { z } from "zod";

export const AssignmentCreateSchema = z.object({
  agentId: z.string().uuid("must be a valid agent id"),
  customerId: z.string().uuid("must be a valid customer id"),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const AssignmentIdParamSchema = z.object({ id: z.string().uuid("must be a valid assignment id") });

/**
 * Paginated from the start, unlike the quotation lists.
 *
 * Those stayed opt-in because three frontend pages already consume them as a bare
 * array. Nothing consumes this endpoint yet, so there is nothing to break and
 * `docs/api-surface.md` §8 applies as written.
 */
export const AssignmentListQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AssignmentCreateInput = z.infer<typeof AssignmentCreateSchema>;
export type AssignmentListQuery = z.infer<typeof AssignmentListQuerySchema>;
