import { z } from "zod";
import { HeroTransition } from "./hero-slide.entity";
import { BODY_FONTS, HEADING_FONTS, SIZE_STEPS } from "./cms-settings";

export const HERO_TRANSITIONS = [HeroTransition.Fade, HeroTransition.Slide, HeroTransition.Zoom] as const;

/**
 * A CTA target that is safe to render: either a site-relative path ("/services#calc")
 * or an absolute https URL. Anything else (javascript:, http:, mailto:, protocol-relative)
 * is rejected so a stored slide can never carry an unsafe link.
 */
export const ctaUrlSchema = z
  .string()
  .trim()
  .max(1024)
  .refine(
    // A relative path must start with a single "/" — "//evil.com" is a protocol-relative
    // URL (an open-redirect vector), so it is rejected along with every non-https scheme.
    (value) => (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\/[^\s]+$/i.test(value),
    { message: "cta_url must be a site-relative path (starting with a single /) or an absolute https:// URL" },
  );

const localizedText = (max: number) => z.string().trim().max(max).optional().nullable();

export const HeroSlideSchema = z.object({
  altEn: localizedText(255),
  altEs: localizedText(255),
  headlineEn: localizedText(200),
  headlineEs: localizedText(200),
  subheadlineEn: localizedText(400),
  subheadlineEs: localizedText(400),
  ctaLabelEn: localizedText(80),
  ctaLabelEs: localizedText(80),
  ctaUrl: ctaUrlSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  durationMs: z.number().int().min(2000).max(15000).optional().nullable(),
  transition: z.enum(HERO_TRANSITIONS).optional(),
  overlayOpacity: z.number().min(0).max(0.8).optional(),
  focalX: z.number().int().min(0).max(100).optional(),
  focalY: z.number().int().min(0).max(100).optional(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
});
export type HeroSlideInput = z.infer<typeof HeroSlideSchema>;

export const HeroSlidePatchSchema = HeroSlideSchema.partial();
export type HeroSlidePatch = z.infer<typeof HeroSlidePatchSchema>;

/** Image metadata sent alongside the multipart upload when creating a slide. */
export const HeroImageMetaSchema = HeroSlideSchema;

export const HeroReorderSchema = z.object({
  /** Ordered list of slide ids; position is assigned by array index. */
  ids: z.array(z.string().uuid()).min(1),
});
export type HeroReorderInput = z.infer<typeof HeroReorderSchema>;

export const HeroToggleSchema = z.object({
  isActive: z.boolean(),
});

export const HeroIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

// ── Content ──────────────────────────────────────────────────────────────────

const localeSchema = z.enum(["en", "es"]);

export const ContentStyleSchema = z.object({
  fontFamily: z.enum([...HEADING_FONTS, ...BODY_FONTS]).optional().nullable(),
  fontWeight: z.number().int().min(100).max(900).optional().nullable(),
  sizeStep: z.enum(SIZE_STEPS).optional().nullable(),
});

/** PUT /admin/cms/content/:key — provide both locales; publishing requires both non-empty. */
export const ContentPutSchema = z.object({
  en: z.string().max(40000),
  es: z.string().max(40000),
  style: ContentStyleSchema.optional(),
  publish: z.boolean().optional(),
});
export type ContentPutInput = z.infer<typeof ContentPutSchema>;

export const ContentKeyParamSchema = z.object({
  key: z.string().trim().min(1).max(150),
});

export const ContentPublishSchema = z.object({
  publish: z.boolean(),
});

export const PublicLocaleQuerySchema = z.object({
  locale: z
    .string()
    .trim()
    .transform((v) => (v === "en" || v.toLowerCase().startsWith("en") ? "en" : "es"))
    .optional(),
});

export { localeSchema };
