import { z } from "zod";

// --- Services ---

export const ServiceCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  // Bilingual display copy. nameEn is required; nameEs defaults to nameEn in the
  // service layer when omitted (same rule the migration backfill uses).
  nameEn: z.string().trim().min(1).max(150),
  nameEs: z.string().trim().min(1).max(150).optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  descriptionEs: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  basePrice: z.coerce.number().finite().min(0).max(999_999_999.99),
  categoryId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
});

export const ServiceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  nameEn: z.string().trim().min(1).max(150).optional(),
  nameEs: z.string().trim().min(1).max(150).optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  descriptionEs: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  basePrice: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
  categoryId: z.string().uuid().optional(),
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

export const WorkerRangeCreateSchema = z
  .object({
    minWorkers: z.coerce.number().int().min(0).max(1_000_000),
    maxWorkers: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    basePrice: z.coerce.number().finite().min(0).max(999_999_999.99),
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.maxWorkers == null || data.minWorkers <= data.maxWorkers, {
    message: "minWorkers must not be greater than maxWorkers",
    path: ["minWorkers"],
  });

export const WorkerRangeUpdateSchema = z
  .object({
    minWorkers: z.coerce.number().int().min(0).max(1_000_000).optional(),
    maxWorkers: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    basePrice: z.coerce.number().finite().min(0).max(999_999_999.99).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => data.maxWorkers == null || data.minWorkers == null || data.minWorkers <= data.maxWorkers,
    {
      message: "minWorkers must not be greater than maxWorkers",
      path: ["minWorkers"],
    },
  );

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

const ALLOWED_KEYS = [
  "currency",
  "quote_validity_days",
  "payment_terms_days",
  "contact_recipient_email",
  // Announcement/offer bar shown above the public navbar (admin-toggled).
  "offer_bar_enabled",
  "offer_bar_text_en",
  "offer_bar_text_es",
  "offer_bar_link",
] as const;
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
  z.object({
    key: z.literal("payment_terms_days"),
    value: z.coerce.number().int().min(1).max(365),
  }),
  z.object({
    // Where the public contact form delivers inquiries. Validated as an email so a typo
    // cannot silently break delivery.
    key: z.literal("contact_recipient_email"),
    value: z.string().trim().email("must be a valid email address").max(254),
  }),
  // ── Announcement/offer bar ──────────────────────────────────────────────────
  z.object({
    key: z.literal("offer_bar_enabled"),
    value: z.boolean(),
  }),
  z.object({
    key: z.literal("offer_bar_text_en"),
    value: z.string().trim().max(200),
  }),
  z.object({
    key: z.literal("offer_bar_text_es"),
    value: z.string().trim().max(200),
  }),
  z.object({
    // A relative path (e.g. "/packages") or absolute URL the bar links to; empty = no link.
    key: z.literal("offer_bar_link"),
    value: z.string().trim().max(500),
  }),
]);

// --- Shared param / query schemas ---

export const PricingIdParamSchema = z.object({ id: z.string().uuid() });

export const IsActiveQuerySchema = z.object({
  isActive: z.enum(["true", "false"]).optional(),
});
