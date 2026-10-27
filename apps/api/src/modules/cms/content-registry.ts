/**
 * The typed registry of editable content keys.
 *
 * A key the admin can edit MUST appear here. A write to any other key is rejected, so the
 * CMS can never grow unbounded free-form keys and the frontend always knows what exists.
 * Each key declares a `type` (how the frontend renders it and how we sanitize it) and a
 * `maxLength` enforced on write.
 *
 * `text`      — a single line (newlines collapsed to spaces).
 * `multiline` — paragraphs allowed (newlines kept); still plain text, never HTML.
 */

export type ContentType = "text" | "multiline";

export interface ContentKeyDef {
  key: string;
  type: ContentType;
  maxLength: number;
  /** Human label for the admin editor. */
  label: string;
  /** Page grouping for the admin editor. */
  group: string;
}

export const CONTENT_REGISTRY: readonly ContentKeyDef[] = [
  { key: "home.hero.fallbackHeadline", type: "text", maxLength: 200, label: "Hero fallback headline", group: "Home" },
  { key: "home.hero.fallbackSubheadline", type: "multiline", maxLength: 400, label: "Hero fallback subheadline", group: "Home" },
  { key: "home.intro.title", type: "text", maxLength: 160, label: "Intro title", group: "Home" },
  { key: "home.intro.body", type: "multiline", maxLength: 1200, label: "Intro body", group: "Home" },
  { key: "about.story.body", type: "multiline", maxLength: 4000, label: "About — our story", group: "About" },
  { key: "contact.address", type: "multiline", maxLength: 400, label: "Contact address", group: "Contact" },
  { key: "footer.tagline", type: "text", maxLength: 160, label: "Footer tagline", group: "Footer" },
  { key: "privacy.title", type: "text", maxLength: 160, label: "Privacy notice title", group: "Privacy" },
  { key: "privacy.body", type: "multiline", maxLength: 40000, label: "Privacy notice body", group: "Privacy" },
  { key: "privacy.effectiveDate", type: "text", maxLength: 40, label: "Privacy effective date", group: "Privacy" },
] as const;

const REGISTRY_BY_KEY = new Map(CONTENT_REGISTRY.map((def) => [def.key, def]));

export function getContentKeyDef(key: string): ContentKeyDef | undefined {
  return REGISTRY_BY_KEY.get(key);
}

export function isRegisteredContentKey(key: string): boolean {
  return REGISTRY_BY_KEY.has(key);
}

/**
 * Sanitizes a content value for storage.
 *
 * - Strips anything that looks like an HTML/XML tag, so raw HTML is never stored and can
 *   never be reflected into the page (defence in depth alongside the frontend's text render).
 * - Removes control characters.
 * - For `text`, collapses all whitespace (including newlines) to single spaces.
 * - For `multiline`, keeps newlines but collapses runs of spaces/tabs and trims each line.
 *
 * Returns the cleaned string; the caller enforces `maxLength` and reports VALIDATION_FAILED.
 */
export function sanitizeContent(raw: string, type: ContentType): string {
  // Drop tags first (handles <script>, <img onerror=...>, stray "<" sequences).
  const withoutTags = raw.replace(/<[^>]*>/g, "");
  // Remove C0/C1 control chars except tab/newline which are handled below.
  // eslint-disable-next-line no-control-regex
  const withoutControls = withoutTags.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  if (type === "text") {
    return withoutControls.replace(/\s+/g, " ").trim();
  }

  return withoutControls
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
