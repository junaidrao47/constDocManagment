import { z } from "zod";

/**
 * Email is normalised at the edge — trimmed and lower-cased — so the unique index
 * on `users.email` actually means one account per address. Without it, `A@x.com`
 * and `a@x.com` register as two separate users and a login with the "wrong" case
 * fails against an account the person is certain they created.
 */
const emailSchema = z.string().trim().toLowerCase().email();

/**
 * Minimum kept at 8 to match the documented contract in `test/README.md`; the cap
 * is there because bcrypt ignores input past 72 bytes, so accepting unbounded
 * passwords would only invite the belief that a 200-character one is stronger.
 */
const passwordSchema = z.string().min(8).max(72);

export const RegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(150).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  // Pinned to a single value: self-service registration must never be able to
  // choose a privileged role. Staff accounts are created through /api/admin/users.
  role: z.enum(["customer"]).default("customer"),
});

export const LoginSchema = z.object({
  email: emailSchema,
  // Not passwordSchema: an existing password that predates the current minimum
  // must still be usable to log in, otherwise the rule locks people out.
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const LogoutSchema = z.object({
  // Required now that the Authorization-header fallback is gone, so a client
  // omitting it gets a field-level 400 rather than a generic one from the service.
  refreshToken: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: emailSchema,
});

export const ResetPasswordSchema = z.object({
  // An opaque 32-byte value in base64url, not a JWT. Only presence is checked here;
  // authenticity is decided by looking it up in Redis.
  token: z.string().min(1).max(512),
  newPassword: passwordSchema,
});
