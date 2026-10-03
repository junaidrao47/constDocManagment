import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { AppSettingEntity } from "../../entities/app-setting.entity";
import { IndustryEntity } from "../../entities/industry.entity";
import { LocationEntity } from "../../entities/location.entity";
import { ServiceEntity } from "../../entities/service.entity";
import { WorkerRangeEntity } from "../../entities/worker-range.entity";
import { PackageEntity } from "../packages/package.entity";
import { calculateQuotation, PricingInput } from "../quotations/pricing.engine";

function numberValue(value: string | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/** Read a single app_settings row; returns the raw jsonb value or null when absent. */
export async function getSettingValue(key: string): Promise<unknown> {
  const row = await AppDataSource.getRepository(AppSettingEntity).findOne({ where: { key } as any });
  return row?.value ?? null;
}

export const publicService = {
  async listServices() {
    const services = await AppDataSource.getRepository(ServiceEntity).find({
      where: { isActive: true },
      order: { name: "ASC" },
    });

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description ?? null,
      basePrice: numberValue(service.basePrice),
    }));
  },

  async listPackages() {
    const packages = await AppDataSource.getRepository(PackageEntity).find({
      relations: { services: true },
      order: { name: "ASC" },
    });

    return packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      type: pkg.type,
      price: numberValue(pkg.price),
      durationDays: pkg.durationDays,
      services: (pkg.services ?? []).map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description ?? null,
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
      AppDataSource.getRepository(IndustryEntity).findOne({ where: { id: input.industryId } }),
      getSettingValue("currency"),
      getSettingValue("quote_validity_days"),
    ]);

    if (!location) {
      throw new HttpError(404, "Location not found");
    }

    const serviceIds = new Set(services.map((service) => service.id));
    const unknownService = input.serviceIds.find((serviceId) => !serviceIds.has(serviceId));
    if (unknownService) {
      throw new HttpError(404, "Service not found");
    }

    const industryWeight = industry?.priceWeight ?? "1";
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