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

export const UpdateProfileSchema = z.object({
	name: z.string().trim().min(1).max(150).optional(),
	phone: z.string().trim().min(6).max(30).optional(),
	email: z.string().email().optional(),
});
