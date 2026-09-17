import { z } from "zod";

export const AdminEmailSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(100_000),
  html: z.string().max(300_000).optional(),
});