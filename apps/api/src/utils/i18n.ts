import { Request } from "express";

export type Locale = "es" | "en";

/**
 * The project is Mexican: Spanish is the default, English the fallback. We only
 * distinguish those two. Any `Accept-Language` that prefers English (its first
 * tag starts with `en`) selects English; everything else, including an absent or
 * malformed header, selects Spanish.
 */
export function localeFromRequest(req: Request): Locale {
  const header = req.headers["accept-language"];
  if (typeof header !== "string" || header.trim() === "") return "es";
  const first = header.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "es";
}

/** Pick the string for the locale, falling back to the other when one is empty. */
export function pickLocale(locale: Locale, en: string | null | undefined, es: string | null | undefined): string | null {
  const primary = locale === "en" ? en : es;
  const fallback = locale === "en" ? es : en;
  return primary ?? fallback ?? null;
}
