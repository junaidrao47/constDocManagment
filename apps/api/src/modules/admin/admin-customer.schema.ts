import { z } from "zod";
import { AccountStatus } from "../users/user.entity";

export const ListCustomersQuerySchema = z.object({
  status: z.nativeEnum(AccountStatus).optional(),
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const ApproveCustomerSchema = z.object({
  // Optional at the edge so the service can answer a missing manager with the precise
  // MANAGER_REQUIRED code (PROJECT-BRIEF §11.2) rather than a generic validation error.
  managerId: z.string().uuid("must be a valid manager id").optional(),
});

export const ReassignManagerSchema = z.object({
  managerId: z.string().uuid("must be a valid manager id"),
  reason: z.string().trim().min(1).max(1000),
});

export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;
