import { z } from "zod";

export const CreateUserSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	role: z.enum(["customer", "agent", "manager", "admin"]),
});

export const UpdateUserSchema = z.object({
	email: z.string().email().optional(),
	role: z.enum(["customer", "agent", "manager", "admin"]).optional(),
	isActive: z.boolean().optional(),
});
