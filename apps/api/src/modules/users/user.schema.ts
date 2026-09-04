import { z } from "zod";
import { UserRole } from "./user.entity";

/** Same normalisation as the auth schemas: one account per address, any casing. */
const emailSchema = z.string().trim().toLowerCase().email();

/** Derived from the enum so a new role cannot be added to the entity and forgotten here. */
const roleSchema = z.nativeEnum(UserRole);

/**
 * Admin-created accounts. This is the only way an agent, manager, or admin comes
 * into existence — self-service registration is pinned to `customer`.
 */
export const CreateUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(72),
  role: roleSchema,
  name: z.string().trim().min(1).max(150).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
});

/** Admin edits to another account. Password changes are not done through here. */
export const UpdateUserSchema = z
  .object({
    email: emailSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "at least one of email, role, or isActive is required",
  });

/**
 * Self-service profile edits.
 *
 * Changing the email requires the current password. Email is the identity used by
 * password reset, so an attacker sitting on a stolen access token could otherwise
 * point the account at their own address and take it over permanently — the second
 * half of the takeover chain that the reset-token fix closes the first half of.
 */
export const UpdateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    phone: z.string().trim().min(6).max(30).optional(),
    email: emailSchema.optional(),
    currentPassword: z.string().min(1).max(72).optional(),
  })
  .refine((value) => !value.email || Boolean(value.currentPassword), {
    path: ["currentPassword"],
    message: "is required when changing the email address",
  });
