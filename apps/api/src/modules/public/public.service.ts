import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { AppSettingEntity } from "../../entities/app-setting.entity";
import { IndustryEntity } from "../../entities/industry.entity";
import { LocationEntity } from "../../entities/location.entity";
import { ServiceEntity } from "../../entities/service.entity";
import { WorkerRangeEntity } from "../../entities/worker-range.entity";
import { PackageEntity } from "../packages/package.entity";
import { calculateQuotation, PricingInput } from "../quotations/pricing.engine";
import { categoryService, serializePublicCategory } from "../categories/category.service";
import { Locale, pickLocale } from "../../utils/i18n";

function numberValue(value: string | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/**
 * Resolve an optional `?category=<slug>` filter to a where-fragment. A slug that
 * matches no category yields a fragment that cannot match any row, so the list
 * comes back empty rather than unfiltered.
 */
async function categoryFilter(categorySlug?: string): Promise<{ categoryId?: string }> {
  if (!categorySlug) return {};
  const id = await categoryService.idForSlug(categorySlug);
  return { categoryId: id ?? "00000000-0000-0000-0000-000000000000" };
}

/** Read a single app_settings row; returns the raw jsonb value or null when absent. */
export async function getSettingValue(key: string): Promise<unknown> {
  const row = await AppDataSource.getRepository(AppSettingEntity).findOne({ where: { key } as any });
  return row?.value ?? null;
}

export const publicService = {
  async listCategories(locale: Locale) {
    return categoryService.listPublic(locale);
  },

  async listServices(locale: Locale, categorySlug?: string) {
    const services = await AppDataSource.getRepository(ServiceEntity).find({
      where: { isActive: true, ...(await categoryFilter(categorySlug)) },
      relations: { category: true },
      order: { name: "ASC" },
    });

    return services.map((service) => ({
      id: service.id,
      name: pickLocale(locale, service.nameEn, service.nameEs),
      description: pickLocale(locale, service.descriptionEn, service.descriptionEs),
      basePrice: numberValue(service.basePrice),
      category: service.category ? serializePublicCategory(service.category, locale) : null,
    }));
  },

  async listPackages(locale: Locale, categorySlug?: string) {
    const packages = await AppDataSource.getRepository(PackageEntity).find({
      // Until `is_active` existed there was nothing to filter on, so drafts and
      // retired packages were served to the public site alongside live ones.
      where: { isActive: true, ...(await categoryFilter(categorySlug)) },
      relations: { services: true, category: true },
      order: { isFeatured: "DESC", sortOrder: "ASC", name: "ASC" },
    });

    return packages.map((pkg) => ({
      id: pkg.id,
      name: pickLocale(locale, pkg.nameEn, pkg.nameEs),
      type: pkg.type,
      description: pickLocale(locale, pkg.descriptionEn, pkg.descriptionEs),
      isFeatured: pkg.isFeatured,
      price: numberValue(pkg.price),
      durationDays: pkg.durationDays,
      category: pkg.category ? serializePublicCategory(pkg.category, locale) : null,
      services: (pkg.services ?? []).map((service) => ({
        id: service.id,
        name: pickLocale(locale, service.nameEn, service.nameEs),
        description: pickLocale(locale, service.descriptionEn, service.descriptionEs),
        basePrice: numberValue(service.basePrice),
      })),
    }));
  },

  async listWorkerRanges() {
    const ranges = await AppDataSource.getRepository(WorkerRangeEntity).find({
      where: { isActive: true },
      order: { minWorkers: "ASC" },
    });

    return ranges.map((range) => ({
      id: range.id,
      minWorkers: range.minWorkers,
      maxWorkers: range.maxWorkers ?? null,
      basePrice: numberValue(range.basePrice),
    }));
  },

  async listLocations() {
    const locations = await AppDataSource.getRepository(LocationEntity).find({
      where: { isActive: true },
      order: { state: "ASC", city: "ASC" },
    });

    return locations.map((location) => ({
      id: location.id,
      state: location.state,
      city: location.city,
      multiplier: numberValue(location.multiplier),
      cityFee: numberValue(location.cityFee),
    }));
  },

  async listIndustries() {
    const industries = await AppDataSource.getRepository(IndustryEntity).find({
      where: { isActive: true },
      order: { name: "ASC" },
    });
    return industries.map((industry) => ({
      id: industry.id,
      name: industry.name,
      description: industry.description ?? null,
      priceWeight: numberValue(industry.priceWeight),
    }));
  },

  async calculate(input: PricingInput) {
    const [workerRanges, location, services, industry, currencyRaw, validityRaw] = await Promise.all([
      AppDataSource.getRepository(WorkerRangeEntity).find({ where: { isActive: true } }),
      AppDataSource.getRepository(LocationEntity).findOne({ where: { id: input.locationId, isActive: true } }),
      AppDataSource.getRepository(ServiceEntity).find({ where: { isActive: true } }),
      AppDataSource.getRepository(IndustryEntity).findOne({ where: { id: input.industryId, isActive: true } }),
      getSettingValue("currency"),
      getSettingValue("quote_validity_days"),
    ]);

    if (!location) {
      throw new HttpError(404, "Location not found");
    }

    if (!industry) {
      throw new HttpError(404, "Industry not found");
    }

    const serviceIds = new Set(services.map((service) => service.id));
    const unknownService = input.serviceIds.find((serviceId) => !serviceIds.has(serviceId));
    if (unknownService) {
      throw new HttpError(404, "Service not found");
    }

    const hasMatchingRange = workerRanges.some(
      (range) => input.workerCount >= range.minWorkers && (range.maxWorkers == null || input.workerCount <= range.maxWorkers),
    );
    if (!hasMatchingRange) {
      throw new HttpError(400, "No active worker range covers the requested worker count");
    }

    const industryWeight = industry.priceWeight ?? "1";
    const currency = typeof currencyRaw === "string" ? currencyRaw : "MXN";
    const quoteValidityDays = typeof validityRaw === "number" && validityRaw >= 1 ? Math.round(validityRaw) : 15;

    const result = calculateQuotation(input, {
      workerRanges,
      location,
      services,
      industryWeight,
      currency,
    });

    return { ...result, quoteValidityDays };
  },
};