import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case (a-z, 0-9, hyphens)");

// isActive is deliberately kept out of create/update: activating/deactivating a
// category is its own action (PATCH /:id/status), mirroring packages/services.
export const CategoryCreateSchema = z.object({
  slug,
  nameEn: z.string().trim().min(1).max(150),
  nameEs: z.string().trim().min(1).max(150),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  descriptionEs: z.string().trim().max(2000).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  imageUrl: z.string().trim().url().max(1024).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

export const CategoryUpdateSchema = z.object({
  slug: slug.optional(),
  nameEn: z.string().trim().min(1).max(150).optional(),
  nameEs: z.string().trim().min(1).max(150).optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  descriptionEs: z.string().trim().max(2000).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  imageUrl: z.string().trim().url().max(1024).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

export const CategoryStatusSchema = z.object({ isActive: z.coerce.boolean() });

export const CategoryReorderSchema = z.object({
  orderedIds: z
    .array(z.string().uuid())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, "orderedIds must be unique"),
});

export const CategoryIdParamSchema = z.object({ id: z.string().uuid("must be a valid category id") });
