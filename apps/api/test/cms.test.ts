import {
  CONTENT_REGISTRY,
  getContentKeyDef,
  isRegisteredContentKey,
  sanitizeContent,
} from "../src/modules/cms/content-registry";
import {
  CmsSettingsSchema,
  DEFAULT_CMS_SETTINGS,
  CMS_SETTING_KEYS,
  mergeCmsSettings,
} from "../src/modules/cms/cms-settings";
import { ctaUrlSchema } from "../src/modules/cms/cms.schema";
import { isSlideLive } from "../src/modules/cms/cms.service";
import { signRevalidationPayload } from "../src/modules/cms/revalidate";

describe("content registry", () => {
  it("registers only known keys", () => {
    expect(isRegisteredContentKey("home.hero.fallbackHeadline")).toBe(true);
    expect(isRegisteredContentKey("home.evil.inject")).toBe(false);
    expect(getContentKeyDef("privacy.body")?.type).toBe("multiline");
  });

  it("strips HTML tags so raw HTML is never stored", () => {
    expect(sanitizeContent('<script>alert(1)</script>Hello', "text")).toBe("alert(1)Hello");
    expect(sanitizeContent('<img src=x onerror=alert(1)>', "text")).toBe("");
    expect(sanitizeContent("<b>bold</b> text", "text")).toBe("bold text");
  });

  it("collapses whitespace for text but keeps paragraphs for multiline", () => {
    expect(sanitizeContent("a\n\n   b   c", "text")).toBe("a b c");
    expect(sanitizeContent("line1\n\n\n\nline2", "multiline")).toBe("line1\n\nline2");
  });

  it("every registry entry has a positive maxLength and a group", () => {
    for (const def of CONTENT_REGISTRY) {
      expect(def.maxLength).toBeGreaterThan(0);
      expect(def.group.length).toBeGreaterThan(0);
    }
  });
});

describe("cta url validation", () => {
  it.each(["/services", "/services#calculator", "https://grupog2h.com/x"])("accepts %s", (url) => {
    expect(ctaUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "http://insecure.com", "//evil.com", "ftp://x"])("rejects %s", (url) => {
    expect(ctaUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("cms settings", () => {
  it("rejects out-of-range timing and bad fonts", () => {
    expect(CmsSettingsSchema.safeParse({ ...DEFAULT_CMS_SETTINGS, heroDefaultDurationMs: 100 }).success).toBe(false);
    expect(CmsSettingsSchema.safeParse({ ...DEFAULT_CMS_SETTINGS, heroTransitionMs: 9000 }).success).toBe(false);
    expect(CmsSettingsSchema.safeParse({ ...DEFAULT_CMS_SETTINGS, headingFont: "Comic Sans" }).success).toBe(false);
    expect(CmsSettingsSchema.safeParse(DEFAULT_CMS_SETTINGS).success).toBe(true);
  });

  it("merges stored rows over defaults and falls back on corruption", () => {
    const merged = mergeCmsSettings({ [CMS_SETTING_KEYS.heroDefaultDurationMs]: 9000, [CMS_SETTING_KEYS.heroLoop]: false });
    expect(merged.heroDefaultDurationMs).toBe(9000);
    expect(merged.heroLoop).toBe(false);
    expect(merged.headingFont).toBe(DEFAULT_CMS_SETTINGS.headingFont);

    const corrupt = mergeCmsSettings({ [CMS_SETTING_KEYS.heroDefaultDurationMs]: "not-a-number" });
    expect(corrupt).toEqual(DEFAULT_CMS_SETTINGS);
  });
});

describe("slide scheduling", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("hides inactive slides", () => {
    expect(isSlideLive({ isActive: false, startsAt: null, endsAt: null }, now)).toBe(false);
  });

  it("shows active slides with no window", () => {
    expect(isSlideLive({ isActive: true, startsAt: null, endsAt: null }, now)).toBe(true);
  });

  it("respects the schedule window", () => {
    expect(isSlideLive({ isActive: true, startsAt: new Date("2026-07-01T00:00:00Z"), endsAt: null }, now)).toBe(false);
    expect(isSlideLive({ isActive: true, startsAt: null, endsAt: new Date("2026-01-01T00:00:00Z") }, now)).toBe(false);
    expect(
      isSlideLive({ isActive: true, startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: new Date("2026-12-31T00:00:00Z") }, now),
    ).toBe(true);
  });
});

describe("revalidation signature", () => {
  it("is deterministic and prefixed", () => {
    const sig = signRevalidationPayload('{"tags":["hero"]}', "a-very-long-test-secret");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signRevalidationPayload('{"tags":["hero"]}', "a-very-long-test-secret")).toBe(sig);
    expect(signRevalidationPayload('{"tags":["content"]}', "a-very-long-test-secret")).not.toBe(sig);
  });
});
