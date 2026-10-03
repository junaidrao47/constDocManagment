import { z } from "zod";

// --- Services ---

export const ServiceCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  basePrice: z.coerce.number().finite().min(0).max(999_999_999.99),
  isActive: z.boolean().optional().default(true),
});

export const ServiceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  basePrice: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
  isActive: z.boolean().optional(),
});

// --- Industries ---

export const IndustryCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  priceWeight: z.coerce.number().finite().min(0.0001).max(9999).optional().default(1),
  isActive: z.boolean().optional().default(true),
});

export const IndustryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priceWeight: z.coerce.number().finite().min(0.0001).max(9999).optional(),
  isActive: z.boolean().optional(),
});

// --- Worker Ranges ---

export const WorkerRangeCreateSchema = z.object({
  minWorkers: z.coerce.number().int().min(0).max(1_000_000),
  maxWorkers: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  basePrice: z.coerce.number().finite().min(0).max(999_999_999.99),
  isActive: z.boolean().optional().default(true),
});

export const WorkerRangeUpdateSchema = z.object({
  minWorkers: z.coerce.number().int().min(0).max(1_000_000).optional(),
  maxWorkers: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  basePrice: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
  isActive: z.boolean().optional(),
});

// --- Locations ---

export const LocationCreateSchema = z.object({
  state: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  multiplier: z.coerce.number().finite().min(0.0001).max(9999).optional().default(1),
  cityFee: z.coerce.number().finite().min(0).max(999_999_999.99).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const LocationUpdateSchema = z.object({
  state: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  multiplier: z.coerce.number().finite().min(0.0001).max(9999).optional(),
  cityFee: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
  isActive: z.boolean().optional(),
});

// --- Settings ---

const ALLOWED_KEYS = ["currency", "quote_validity_days"] as const;
export type SettingKey = (typeof ALLOWED_KEYS)[number];

export const SettingKeyParamSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
});

/**
 * Discriminated union so each key enforces its own value type.
 * currency:            3-letter uppercase ISO-4217 code
 * quote_validity_days: integer 1–365
 */
export const SettingUpdateSchema = z.discriminatedUnion("key", [
  z.object({
    key: z.literal("currency"),
    value: z.string().regex(/^[A-Z]{3}$/, "currency must be a 3-letter uppercase ISO-4217 code"),
  }),
  z.object({
    key: z.literal("quote_validity_days"),
    value: z.coerce.number().int().min(1).max(365),
  }),
]);

// --- Shared param / query schemas ---

export const PricingIdParamSchema = z.object({ id: z.string().uuid() });

export const IsActiveQuerySchema = z.object({
  isActive: z.enum(["true", "false"]).optional(),
});
