import { z } from "zod";

export const PackageSchema = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.string().trim().min(1).max(50),
  price: z.coerce.number().finite().min(0).max(999999999.99),
  durationDays: z.coerce.number().int().min(1).max(3650),
  serviceIds: z.array(z.string().uuid()).max(100).refine((ids) => new Set(ids).size === ids.length, "serviceIds must be unique").default([]),
});

export const PackageIdParamSchema = z.object({ id: z.string().uuid("must be a valid package id") });