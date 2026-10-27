import { AppDataSource } from "../../config/database";
import { AppSettingEntity } from "../../entities/app-setting.entity";
import { AppError, HttpError } from "../../utils/http-error";
import { saveHeroObject, removeHeroObject } from "../../utils/s3";
import { HeroSlideEntity, HeroTransition } from "./hero-slide.entity";
import { ContentStatus, SiteContentEntity, SiteContentHistoryEntity } from "./site-content.entity";
import type { HeroSlideInput, HeroSlidePatch } from "./cms.schema";
import {
  CMS_SETTING_KEYS,
  CmsSettings,
  CmsSettingsPatch,
  DEFAULT_CMS_SETTINGS,
  mergeCmsSettings,
} from "./cms-settings";
import { CONTENT_REGISTRY, getContentKeyDef, sanitizeContent } from "./content-registry";
import { fireRevalidation } from "./revalidate";

type Locale = "en" | "es";

// ── Hero: serialization ────────────────────────────────────────────────────────

/** Full admin view of a slide (both locales, schedule, all controls). */
function serializeHeroAdmin(s: HeroSlideEntity) {
  return {
    id: s.id,
    imageUrl: s.imageUrl,
    imageKey: s.imageKey,
    altEn: s.altEn ?? null,
    altEs: s.altEs ?? null,
    headlineEn: s.headlineEn ?? null,
    headlineEs: s.headlineEs ?? null,
    subheadlineEn: s.subheadlineEn ?? null,
    subheadlineEs: s.subheadlineEs ?? null,
    ctaLabelEn: s.ctaLabelEn ?? null,
    ctaLabelEs: s.ctaLabelEs ?? null,
    ctaUrl: s.ctaUrl ?? null,
    position: s.position,
    isActive: s.isActive,
    durationMs: s.durationMs ?? null,
    transition: s.transition,
    overlayOpacity: Number(s.overlayOpacity),
    focalX: s.focalX,
    focalY: s.focalY,
    startsAt: s.startsAt ?? null,
    endsAt: s.endsAt ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** Public view of a slide for one locale, with the global default duration applied. */
function serializeHeroPublic(s: HeroSlideEntity, locale: Locale, defaultDurationMs: number) {
  const pick = (en?: string | null, es?: string | null) =>
    (locale === "en" ? en ?? es : es ?? en) ?? null;
  return {
    id: s.id,
    imageUrl: s.imageUrl,
    alt: pick(s.altEn, s.altEs),
    headline: pick(s.headlineEn, s.headlineEs),
    subheadline: pick(s.subheadlineEn, s.subheadlineEs),
    ctaLabel: pick(s.ctaLabelEn, s.ctaLabelEs),
    ctaUrl: s.ctaUrl ?? null,
    durationMs: s.durationMs ?? defaultDurationMs,
    transition: s.transition,
    overlayOpacity: Number(s.overlayOpacity),
    focalX: s.focalX,
    focalY: s.focalY,
  };
}

/**
 * Whether a slide should show right now: active, and inside its schedule window when one
 * is set. Pure and exported so the scheduling rule is unit-tested without a database.
 */
export function isSlideLive(
  slide: Pick<HeroSlideEntity, "isActive" | "startsAt" | "endsAt">,
  now: Date,
): boolean {
  if (!slide.isActive) return false;
  if (slide.startsAt && now < new Date(slide.startsAt)) return false;
  if (slide.endsAt && now > new Date(slide.endsAt)) return false;
  return true;
}

// ── Hero: write helpers ──────────────────────────────────────────────────────

function applyHeroPatch(entity: HeroSlideEntity, patch: HeroSlidePatch): void {
  if (patch.altEn !== undefined) entity.altEn = patch.altEn ?? null;
  if (patch.altEs !== undefined) entity.altEs = patch.altEs ?? null;
  if (patch.headlineEn !== undefined) entity.headlineEn = patch.headlineEn ?? null;
  if (patch.headlineEs !== undefined) entity.headlineEs = patch.headlineEs ?? null;
  if (patch.subheadlineEn !== undefined) entity.subheadlineEn = patch.subheadlineEn ?? null;
  if (patch.subheadlineEs !== undefined) entity.subheadlineEs = patch.subheadlineEs ?? null;
  if (patch.ctaLabelEn !== undefined) entity.ctaLabelEn = patch.ctaLabelEn ?? null;
  if (patch.ctaLabelEs !== undefined) entity.ctaLabelEs = patch.ctaLabelEs ?? null;
  if (patch.ctaUrl !== undefined) entity.ctaUrl = patch.ctaUrl ?? null;
  if (patch.isActive !== undefined) entity.isActive = patch.isActive;
  if (patch.durationMs !== undefined) entity.durationMs = patch.durationMs ?? null;
  if (patch.transition !== undefined) entity.transition = patch.transition as HeroTransition;
  if (patch.overlayOpacity !== undefined) entity.overlayOpacity = patch.overlayOpacity;
  if (patch.focalX !== undefined) entity.focalX = patch.focalX;
  if (patch.focalY !== undefined) entity.focalY = patch.focalY;
  if (patch.startsAt !== undefined) entity.startsAt = patch.startsAt ?? null;
  if (patch.endsAt !== undefined) entity.endsAt = patch.endsAt ?? null;
}

// ── Settings persistence (app_settings, cms. prefixed) ──────────────────────────

async function readCmsSettings(): Promise<CmsSettings> {
  const rows = await AppDataSource.getRepository(AppSettingEntity).find();
  const stored: Record<string, unknown> = {};
  for (const row of rows) stored[row.key] = row.value;
  return mergeCmsSettings(stored);
}

async function writeSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  const repo = AppDataSource.getRepository(AppSettingEntity);
  const now = new Date();
  const existing = await repo.findOne({ where: { key } });
  if (existing) {
    // `value` is typed `unknown` on the entity (JSONB), which TypeORM's update typings
    // reject; the pricing settings service casts for the same reason.
    await (repo as any).update({ key }, { value, updatedBy, updatedAt: now });
  } else {
    await repo.save(repo.create({ key, value, updatedBy, updatedAt: now } as any));
  }
}

export const cmsService = {
  // ── Hero slides (admin) ──────────────────────────────────────────────────────

  async listHeroSlides() {
    const rows = await AppDataSource.getRepository(HeroSlideEntity).find({
      order: { position: "ASC", createdAt: "ASC" },
    });
    return rows.map(serializeHeroAdmin);
  },

  async getHeroSlide(id: string) {
    const entity = await AppDataSource.getRepository(HeroSlideEntity).findOne({ where: { id } });
    if (!entity) throw new HttpError(404, "Hero slide not found");
    return serializeHeroAdmin(entity);
  },

  async createHeroSlide(
    file: { buffer: Buffer; originalName: string; mimeType: string },
    input: HeroSlideInput,
    updatedBy: string,
  ) {
    const stored = await saveHeroObject(file.originalName, file.buffer, file.mimeType);
    const repo = AppDataSource.getRepository(HeroSlideEntity);
    const count = await repo.count();
    const entity = repo.create({
      imageKey: stored.key,
      imageUrl: stored.url,
      position: count,
      transition: HeroTransition.Fade,
      overlayOpacity: 0.4,
      focalX: 50,
      focalY: 50,
      isActive: input.isActive ?? true,
      updatedBy,
    });
    applyHeroPatch(entity, input);
    const saved = await repo.save(entity);
    await fireRevalidation(["hero"]);
    return serializeHeroAdmin(saved as HeroSlideEntity);
  },

  async updateHeroSlide(id: string, patch: HeroSlidePatch, updatedBy: string) {
    const repo = AppDataSource.getRepository(HeroSlideEntity);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) throw new HttpError(404, "Hero slide not found");
    applyHeroPatch(entity, patch);
    entity.updatedBy = updatedBy;
    const saved = await repo.save(entity);
    await fireRevalidation(["hero"]);
    return serializeHeroAdmin(saved as HeroSlideEntity);
  },

  async toggleHeroSlide(id: string, isActive: boolean, updatedBy: string) {
    return this.updateHeroSlide(id, { isActive }, updatedBy);
  },

  async deleteHeroSlide(id: string) {
    const repo = AppDataSource.getRepository(HeroSlideEntity);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) throw new HttpError(404, "Hero slide not found");
    await removeHeroObject(entity.imageKey);
    await repo.remove(entity);
    await fireRevalidation(["hero"]);
    return { id, deleted: true };
  },

  /** Sets each slide's position to its index in `ids`. Every id must exist. */
  async reorderHeroSlides(ids: string[], updatedBy: string) {
    const repo = AppDataSource.getRepository(HeroSlideEntity);
    const rows = await repo.find();
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) {
      if (!byId.has(id)) throw new AppError("VALIDATION_FAILED", 400, `Unknown hero slide id: ${id}`);
    }
    await AppDataSource.transaction(async (manager) => {
      for (let index = 0; index < ids.length; index += 1) {
        await manager.update(HeroSlideEntity, { id: ids[index] }, { position: index, updatedBy });
      }
    });
    await fireRevalidation(["hero"]);
    return this.listHeroSlides();
  },

  // ── Hero slides (public) ─────────────────────────────────────────────────────

  async publicHero(locale: Locale) {
    const settings = await readCmsSettings();
    const rows = await AppDataSource.getRepository(HeroSlideEntity).find({
      where: { isActive: true },
      order: { position: "ASC", createdAt: "ASC" },
    });
    const now = new Date();
    const slides = rows
      .filter((row) => isSlideLive(row, now))
      .map((row) => serializeHeroPublic(row, locale, settings.heroDefaultDurationMs));
    return {
      slides,
      settings: {
        autoplay: settings.heroAutoplay,
        defaultDurationMs: settings.heroDefaultDurationMs,
        transitionMs: settings.heroTransitionMs,
        pauseOnHover: settings.heroPauseOnHover,
        loop: settings.heroLoop,
        headingFont: settings.headingFont,
        bodyFont: settings.bodyFont,
        baseTextScale: settings.baseTextScale,
      },
    };
  },

  // ── Settings ─────────────────────────────────────────────────────────────────

  async getSettings(): Promise<CmsSettings> {
    return readCmsSettings();
  },

  async updateSettings(patch: CmsSettingsPatch, updatedBy: string): Promise<CmsSettings> {
    for (const field of Object.keys(patch) as (keyof CmsSettings)[]) {
      const value = patch[field];
      if (value === undefined) continue;
      await writeSetting(CMS_SETTING_KEYS[field], value, updatedBy);
    }
    await fireRevalidation(["hero", "content"]);
    return readCmsSettings();
  },

  // ── Content ──────────────────────────────────────────────────────────────────

  /** Admin: every registered key with its current EN/ES rows (or empty defaults). */
  async listContent() {
    const rows = await AppDataSource.getRepository(SiteContentEntity).find();
    const byKeyLocale = new Map(rows.map((r) => [`${r.contentKey}:${r.locale}`, r]));
    return CONTENT_REGISTRY.map((def) => {
      const en = byKeyLocale.get(`${def.key}:en`);
      const es = byKeyLocale.get(`${def.key}:es`);
      return {
        key: def.key,
        label: def.label,
        group: def.group,
        type: def.type,
        maxLength: def.maxLength,
        en: en?.value ?? "",
        es: es?.value ?? "",
        status: en?.status ?? es?.status ?? ContentStatus.Draft,
        version: Math.max(en?.version ?? 1, es?.version ?? 1),
        style: {
          fontFamily: en?.fontFamily ?? es?.fontFamily ?? null,
          fontWeight: en?.fontWeight ?? es?.fontWeight ?? null,
          sizeStep: en?.sizeStep ?? es?.sizeStep ?? null,
        },
        updatedAt: en?.updatedAt ?? es?.updatedAt ?? null,
      };
    });
  },

  async putContent(
    key: string,
    input: { en: string; es: string; style?: { fontFamily?: string | null; fontWeight?: number | null; sizeStep?: string | null }; publish?: boolean },
    updatedBy: string,
  ) {
    const def = getContentKeyDef(key);
    if (!def) throw new AppError("VALIDATION_FAILED", 400, `Unknown content key: ${key}`);

    const cleanEn = sanitizeContent(input.en, def.type);
    const cleanEs = sanitizeContent(input.es, def.type);
    if (cleanEn.length > def.maxLength || cleanEs.length > def.maxLength) {
      throw new AppError("VALIDATION_FAILED", 400, `Content for ${key} exceeds the ${def.maxLength}-character limit`, {
        maxLength: def.maxLength,
      });
    }
    // Publishing requires both locales to carry text.
    if (input.publish && (cleanEn.length === 0 || cleanEs.length === 0)) {
      throw new AppError("VALIDATION_FAILED", 400, "Both English and Spanish are required to publish", {
        fields: { en: cleanEn.length === 0, es: cleanEs.length === 0 },
      });
    }

    const status = input.publish ? ContentStatus.Published : ContentStatus.Draft;
    const repo = AppDataSource.getRepository(SiteContentEntity);
    const historyRepo = AppDataSource.getRepository(SiteContentHistoryEntity);

    for (const [locale, value] of [["en", cleanEn], ["es", cleanEs]] as const) {
      const existing = await repo.findOne({ where: { contentKey: key, locale } });
      const nextVersion = input.publish ? (existing?.version ?? 0) + 1 : existing?.version ?? 1;
      if (existing) {
        existing.value = value;
        existing.status = status;
        existing.version = nextVersion;
        existing.fontFamily = input.style?.fontFamily ?? null;
        existing.fontWeight = input.style?.fontWeight ?? null;
        existing.sizeStep = input.style?.sizeStep ?? null;
        existing.updatedBy = updatedBy;
        await repo.save(existing);
      } else {
        await repo.save(
          repo.create({
            contentKey: key,
            locale,
            value,
            status,
            version: nextVersion,
            fontFamily: input.style?.fontFamily ?? null,
            fontWeight: input.style?.fontWeight ?? null,
            sizeStep: input.style?.sizeStep ?? null,
            updatedBy,
          }),
        );
      }
      if (input.publish) {
        await historyRepo.save(
          historyRepo.create({ contentKey: key, locale, value, version: nextVersion, publishedBy: updatedBy }),
        );
      }
    }

    if (input.publish) await fireRevalidation(["content"]);
    return this.getContentAdmin(key);
  },

  async getContentAdmin(key: string) {
    const def = getContentKeyDef(key);
    if (!def) throw new HttpError(404, "Unknown content key");
    const all = await this.listContent();
    return all.find((entry) => entry.key === key)!;
  },

  async setPublished(key: string, publish: boolean, updatedBy: string) {
    const def = getContentKeyDef(key);
    if (!def) throw new HttpError(404, "Unknown content key");
    const repo = AppDataSource.getRepository(SiteContentEntity);
    const rows = await repo.find({ where: { contentKey: key } });
    if (rows.length === 0) throw new AppError("VALIDATION_FAILED", 400, "Nothing saved for this key yet");
    if (publish && rows.some((r) => r.value.trim().length === 0)) {
      throw new AppError("VALIDATION_FAILED", 400, "Both English and Spanish are required to publish");
    }
    for (const row of rows) {
      row.status = publish ? ContentStatus.Published : ContentStatus.Draft;
      row.updatedBy = updatedBy;
      await repo.save(row);
    }
    await fireRevalidation(["content"]);
    return this.getContentAdmin(key);
  },

  async contentHistory(key: string) {
    if (!getContentKeyDef(key)) throw new HttpError(404, "Unknown content key");
    const rows = await AppDataSource.getRepository(SiteContentHistoryEntity).find({
      where: { contentKey: key },
      order: { version: "DESC", createdAt: "DESC" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      locale: r.locale,
      value: r.value,
      version: r.version,
      publishedAt: r.createdAt,
      publishedBy: r.publishedBy ?? null,
    }));
  },

  /** Public: published content for one locale as a flat { key: { value, style } } map. */
  async publicContent(locale: Locale) {
    const rows = await AppDataSource.getRepository(SiteContentEntity).find({
      where: { locale, status: ContentStatus.Published },
    });
    const content: Record<string, { value: string; fontFamily: string | null; fontWeight: number | null; sizeStep: string | null }> = {};
    for (const row of rows) {
      content[row.contentKey] = {
        value: row.value,
        fontFamily: row.fontFamily ?? null,
        fontWeight: row.fontWeight ?? null,
        sizeStep: row.sizeStep ?? null,
      };
    }
    return content;
  },
};

export { DEFAULT_CMS_SETTINGS };
