import { z } from "zod";
import { UserRole } from "../users/user.entity";

/**
 * Query-string schemas.
 *
 * Everything arrives as a string, so numbers and booleans need `z.coerce`. Page
 * size is capped: without a ceiling, `?pageSize=100000` turns a list endpoint into
 * a way to pull the whole user table in one request.
 */
export const ListUsersQuerySchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  search: z.string().trim().min(1).max(150).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const UserIdParamSchema = z.object({
  id: z.string().uuid("must be a valid user id"),
});

export const SetUserStatusSchema = z.object({
  isActive: z.boolean(),
});
