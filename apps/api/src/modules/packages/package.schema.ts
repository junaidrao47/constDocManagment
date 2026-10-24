import { z } from "zod";

export const PackageSchema = z.object({
  name: z.string().trim().min(1).max(150),
  // Bilingual display copy; nameEs defaults to nameEn in the service layer when omitted.
  nameEn: z.string().trim().min(1).max(150),
  nameEs: z.string().trim().min(1).max(150).optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  descriptionEs: z.string().trim().max(2000).nullable().optional(),
  type: z.string().trim().min(1).max(50),
  price: z.coerce.number().finite().min(0).max(999999999.99),
  durationDays: z.coerce.number().int().min(1).max(3650),
  categoryId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).max(100).refine((ids) => new Set(ids).size === ids.length, "serviceIds must be unique").default([]),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isFeatured: z.coerce.boolean().default(false),
  // The active flag is deliberately not settable here: retiring a package is a
  // separate action, the same way services are deactivated rather than edited
  // into inactivity.
});

export const PackageIdParamSchema = z.object({ id: z.string().uuid("must be a valid package id") });

// Retiring/restoring a package is its own action, kept out of PackageSchema so an
// edit cannot silently flip it. Mirrors SetUserStatusSchema.
export const PackageStatusSchema = z.object({ isActive: z.coerce.boolean() });