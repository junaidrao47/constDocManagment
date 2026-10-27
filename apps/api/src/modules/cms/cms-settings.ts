import { z } from "zod";

/**
 * Global CMS settings.
 *
 * Stored in the existing `app_settings` key/value table, each under a `cms.` prefix so they
 * never collide with the pricing settings (currency, quote_validity_days, …). The allow-lists
 * for fonts and the text-size scale come from docs/design-tokens.md (all Google Fonts,
 * license-safe) — there is no free-form font or CSS input.
 */

export const HEADING_FONTS = ["Roboto Condensed", "Oswald", "Archivo", "Hanken Grotesk", "Inter Tight"] as const;
export const BODY_FONTS = ["Inter", "Source Sans 3", "Roboto", "Public Sans"] as const;
export const TEXT_SCALES = [0.95, 1.0, 1.05, 1.1] as const;
export const SIZE_STEPS = ["sm", "md", "lg", "xl"] as const;

/** Prefix under which every CMS setting lives in app_settings. */
export const CMS_SETTING_PREFIX = "cms.";

export const CmsSettingsSchema = z.object({
  heroAutoplay: z.boolean(),
  heroDefaultDurationMs: z.number().int().min(2000).max(15000),
  heroTransitionMs: z.number().int().min(200).max(2000),
  heroPauseOnHover: z.boolean(),
  heroLoop: z.boolean(),
  headingFont: z.enum(HEADING_FONTS),
  bodyFont: z.enum(BODY_FONTS),
  baseTextScale: z
    .number()
    .refine((v) => (TEXT_SCALES as readonly number[]).includes(v), { message: "must be one of 0.95, 1, 1.05, 1.1" }),
});

export type CmsSettings = z.infer<typeof CmsSettingsSchema>;

/** The partial a PUT accepts — any subset of the settings. */
export const CmsSettingsPatchSchema = CmsSettingsSchema.partial();
export type CmsSettingsPatch = z.infer<typeof CmsSettingsPatchSchema>;

export const DEFAULT_CMS_SETTINGS: CmsSettings = {
  heroAutoplay: true,
  heroDefaultDurationMs: 6000,
  heroTransitionMs: 600,
  heroPauseOnHover: true,
  heroLoop: true,
  headingFont: "Roboto Condensed",
  bodyFont: "Inter",
  baseTextScale: 1.0,
};

/** Maps a settings field to its `app_settings` key (snake_case under the cms. prefix). */
export const CMS_SETTING_KEYS: Record<keyof CmsSettings, string> = {
  heroAutoplay: `${CMS_SETTING_PREFIX}hero_autoplay`,
  heroDefaultDurationMs: `${CMS_SETTING_PREFIX}hero_default_duration_ms`,
  heroTransitionMs: `${CMS_SETTING_PREFIX}hero_transition_ms`,
  heroPauseOnHover: `${CMS_SETTING_PREFIX}hero_pause_on_hover`,
  heroLoop: `${CMS_SETTING_PREFIX}hero_loop`,
  headingFont: `${CMS_SETTING_PREFIX}heading_font`,
  bodyFont: `${CMS_SETTING_PREFIX}body_font`,
  baseTextScale: `${CMS_SETTING_PREFIX}base_text_scale`,
};

/** Builds the full settings object from the stored rows, falling back to defaults per field. */
export function mergeCmsSettings(stored: Record<string, unknown>): CmsSettings {
  const out: Record<string, unknown> = { ...DEFAULT_CMS_SETTINGS };
  for (const field of Object.keys(DEFAULT_CMS_SETTINGS) as (keyof CmsSettings)[]) {
    const stashed = stored[CMS_SETTING_KEYS[field]];
    if (stashed !== undefined && stashed !== null) {
      out[field] = stashed;
    }
  }
  // Validate the merged result; on any corruption fall back entirely to defaults.
  const parsed = CmsSettingsSchema.safeParse(out);
  return parsed.success ? parsed.data : DEFAULT_CMS_SETTINGS;
}
