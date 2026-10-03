import { AppDataSource } from "../../config/database";
import { AppSettingEntity } from "../../entities/app-setting.entity";
import { IndustryEntity } from "../../entities/industry.entity";
import { LocationEntity } from "../../entities/location.entity";
import { ServiceEntity } from "../../entities/service.entity";
import { WorkerRangeEntity } from "../../entities/worker-range.entity";
import { HttpError } from "../../utils/http-error";

// ─── small helper ────────────────────────────────────────────────────────────

function n(v: string | number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

// ─── Services ─────────────────────────────────────────────────────────────────

function serializeService(s: ServiceEntity) {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    basePrice: n(s.basePrice),
    isActive: s.isActive,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function findServiceOr404(id: string): Promise<ServiceEntity> {
  const entity = await AppDataSource.getRepository(ServiceEntity).findOne({ where: { id } });
  if (!entity) throw new HttpError(404, "Service not found");
  return entity;
}

// ─── Industries ───────────────────────────────────────────────────────────────

function serializeIndustry(i: IndustryEntity) {
  return {
    id: i.id,
    name: i.name,
    description: i.description ?? null,
    priceWeight: n(i.priceWeight),
    isActive: i.isActive,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

async function findIndustryOr404(id: string): Promise<IndustryEntity> {
  const entity = await AppDataSource.getRepository(IndustryEntity).findOne({ where: { id } });
  if (!entity) throw new HttpError(404, "Industry not found");
  return entity;
}

// ─── Worker Ranges ────────────────────────────────────────────────────────────

function serializeRange(r: WorkerRangeEntity) {
  return {
    id: r.id,
    minWorkers: r.minWorkers,
    maxWorkers: r.maxWorkers ?? null,
    basePrice: n(r.basePrice),
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function findRangeOr404(id: string): Promise<WorkerRangeEntity> {
  const entity = await AppDataSource.getRepository(WorkerRangeEntity).findOne({ where: { id } });
  if (!entity) throw new HttpError(404, "Worker range not found");
  return entity;
}

/**
 * Ensures the proposed active range [newMin, newMax] does not overlap any other
 * active range (excluding the row being edited, if any).
 * Also enforces that only the highest range may have an unlimited max (null).
 */
async function assertNoOverlap(excludeId: string | null, newMin: number, newMax: number | null): Promise<void> {
  const allActive = await AppDataSource.getRepository(WorkerRangeEntity).find({ where: { isActive: true } });
  const others = allActive.filter((r) => r.id !== excludeId);

  if (newMax === null) {
    const existingOpen = others.find((r) => r.maxWorkers == null);
    if (existingOpen) {
      throw new HttpError(
        400,
        `Only the highest active range may have an unlimited max (existing open-ended range starts at ${existingOpen.minWorkers})`,
      );
    }

    const hasHigherRange = others.some((r) => r.minWorkers >= newMin);
    if (hasHigherRange) {
      throw new HttpError(400, "Only the highest active range may have an unlimited max");
    }
  }

  for (const existing of others) {
    const eMin = existing.minWorkers;
    const eMax = existing.maxWorkers ?? Infinity;
    const cMax = newMax ?? Infinity;

    if (newMin <= eMax && cMax >= eMin) {
      throw new HttpError(
        400,
        `Range [${newMin}, ${newMax ?? "∞"}] overlaps with existing active range [${eMin}, ${existing.maxWorkers ?? "∞"}]`,
      );
    }
  }
}

// ─── Locations ────────────────────────────────────────────────────────────────

function serializeLocation(l: LocationEntity) {
  return {
    id: l.id,
    state: l.state,
    city: l.city,
    multiplier: n(l.multiplier),
    cityFee: n(l.cityFee),
    isActive: l.isActive,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

async function findLocationOr404(id: string): Promise<LocationEntity> {
  const entity = await AppDataSource.getRepository(LocationEntity).findOne({ where: { id } });
  if (!entity) throw new HttpError(404, "Location not found");
  return entity;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface ServiceInput {
  name: string;
  description?: string | null;
  basePrice: number;
  isActive?: boolean;
}

export interface ServicePatch {
  name?: string;
  description?: string | null;
  basePrice?: number;
  isActive?: boolean;
}

// ─── Industry ─────────────────────────────────────────────────────────────────

export interface IndustryInput {
  name: string;
  description?: string | null;
  priceWeight?: number;
  isActive?: boolean;
}

export interface IndustryPatch {
  name?: string;
  description?: string | null;
  priceWeight?: number;
  isActive?: boolean;
}

// ─── WorkerRange ──────────────────────────────────────────────────────────────

export interface WorkerRangeInput {
  minWorkers: number;
  maxWorkers?: number | null;
  basePrice: number;
  isActive?: boolean;
}

export interface WorkerRangePatch {
  minWorkers?: number;
  maxWorkers?: number | null;
  basePrice?: number;
  isActive?: boolean;
}

// ─── Location ─────────────────────────────────────────────────────────────────

export interface LocationInput {
  state: string;
  city: string;
  multiplier?: number;
  cityFee?: number;
  isActive?: boolean;
}

export interface LocationPatch {
  state?: string;
  city?: string;
  multiplier?: number;
  cityFee?: number;
  isActive?: boolean;
}

// ─── Main service object ──────────────────────────────────────────────────────

export const adminPricingService = {
  // ── Services ──────────────────────────────────────────────────────────────

  async listServices(isActive?: boolean) {
    const where = isActive === undefined ? {} : { isActive };
    const rows = await AppDataSource.getRepository(ServiceEntity).find({ where, order: { name: "ASC" } });
    return rows.map(serializeService);
  },

  async createService(input: ServiceInput) {
    const repo = AppDataSource.getRepository(ServiceEntity);
    const entity = repo.create({
      name: input.name,
      description: input.description ?? null,
      basePrice: input.basePrice.toFixed(2),
      isActive: input.isActive ?? true,
    });
    const saved = await repo.save(entity);
    return serializeService(saved as ServiceEntity);
  },

  async updateService(id: string, patch: ServicePatch) {
    const repo = AppDataSource.getRepository(ServiceEntity);
    const entity = await findServiceOr404(id);
    if (patch.name !== undefined) entity.name = patch.name;
    if (patch.description !== undefined) entity.description = patch.description ?? null;
    if (patch.basePrice !== undefined) entity.basePrice = patch.basePrice.toFixed(2);
    if (patch.isActive !== undefined) entity.isActive = patch.isActive;
    const saved = await repo.save(entity);
    return serializeService(saved as ServiceEntity);
  },

  async deactivateService(id: string) {
    return this.updateService(id, { isActive: false });
  },

  // ── Industries ────────────────────────────────────────────────────────────

  async listIndustries(isActive?: boolean) {
    const where = isActive === undefined ? {} : { isActive };
    const rows = await AppDataSource.getRepository(IndustryEntity).find({ where, order: { name: "ASC" } });
    return rows.map(serializeIndustry);
  },

  async createIndustry(input: IndustryInput) {
    const repo = AppDataSource.getRepository(IndustryEntity);
    const entity = repo.create({
      name: input.name,
      description: input.description ?? null,
      priceWeight: (input.priceWeight ?? 1).toFixed(4),
      isActive: input.isActive ?? true,
    });
    const saved = await repo.save(entity);
    return serializeIndustry(saved as IndustryEntity);
  },

  async updateIndustry(id: string, patch: IndustryPatch) {
    const repo = AppDataSource.getRepository(IndustryEntity);
    const entity = await findIndustryOr404(id);
    if (patch.name !== undefined) entity.name = patch.name;
    if (patch.description !== undefined) entity.description = patch.description ?? null;
    if (patch.priceWeight !== undefined) entity.priceWeight = patch.priceWeight.toFixed(4);
    if (patch.isActive !== undefined) entity.isActive = patch.isActive;
    const saved = await repo.save(entity);
    return serializeIndustry(saved as IndustryEntity);
  },

  async deactivateIndustry(id: string) {
    return this.updateIndustry(id, { isActive: false });
  },

  // ── Worker Ranges ─────────────────────────────────────────────────────────

  async listWorkerRanges(isActive?: boolean) {
    const where = isActive === undefined ? {} : { isActive };
    const rows = await AppDataSource.getRepository(WorkerRangeEntity).find({ where, order: { minWorkers: "ASC" } });
    return rows.map(serializeRange);
  },

  async createWorkerRange(input: WorkerRangeInput) {
    if (input.maxWorkers != null && input.minWorkers > input.maxWorkers) {
      throw new HttpError(400, "minWorkers must not be greater than maxWorkers");
    }
    // Only check overlap if the new range will be active
    if (input.isActive !== false) {
      await assertNoOverlap(null, input.minWorkers, input.maxWorkers ?? null);
    }
    const repo = AppDataSource.getRepository(WorkerRangeEntity);
    const entity = repo.create({
      minWorkers: input.minWorkers,
      maxWorkers: input.maxWorkers ?? null,
      basePrice: input.basePrice.toFixed(2),
      isActive: input.isActive ?? true,
    });
    const saved = await repo.save(entity);
    return serializeRange(saved as WorkerRangeEntity);
  },

  async updateWorkerRange(id: string, patch: WorkerRangePatch) {
    const repo = AppDataSource.getRepository(WorkerRangeEntity);
    const entity = await findRangeOr404(id);

    const newMin = patch.minWorkers ?? entity.minWorkers;
    const newMax = patch.maxWorkers !== undefined ? (patch.maxWorkers ?? null) : (entity.maxWorkers ?? null);
    const willBeActive = patch.isActive !== undefined ? patch.isActive : entity.isActive;

    if (newMax !== null && newMin > newMax) {
      throw new HttpError(400, "minWorkers must not be greater than maxWorkers");
    }

    if (willBeActive) {
      await assertNoOverlap(id, newMin, newMax);
    }

    if (patch.minWorkers !== undefined) entity.minWorkers = patch.minWorkers;
    if (patch.maxWorkers !== undefined) entity.maxWorkers = patch.maxWorkers ?? null;
    if (patch.basePrice !== undefined) entity.basePrice = patch.basePrice.toFixed(2);
    if (patch.isActive !== undefined) entity.isActive = patch.isActive;
    const saved = await repo.save(entity);
    return serializeRange(saved as WorkerRangeEntity);
  },

  async deactivateWorkerRange(id: string) {
    return this.updateWorkerRange(id, { isActive: false });
  },

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(isActive?: boolean) {
    const where = isActive === undefined ? {} : { isActive };
    const rows = await AppDataSource.getRepository(LocationEntity).find({ where, order: { state: "ASC", city: "ASC" } });
    return rows.map(serializeLocation);
  },

  async createLocation(input: LocationInput) {
    const repo = AppDataSource.getRepository(LocationEntity);
    const entity = repo.create({
      state: input.state,
      city: input.city,
      multiplier: (input.multiplier ?? 1).toFixed(4),
      cityFee: (input.cityFee ?? 0).toFixed(2),
      isActive: input.isActive ?? true,
    });
    const saved = await repo.save(entity);
    return serializeLocation(saved as LocationEntity);
  },

  async updateLocation(id: string, patch: LocationPatch) {
    const repo = AppDataSource.getRepository(LocationEntity);
    const entity = await findLocationOr404(id);
    if (patch.state !== undefined) entity.state = patch.state;
    if (patch.city !== undefined) entity.city = patch.city;
    if (patch.multiplier !== undefined) entity.multiplier = patch.multiplier.toFixed(4);
    if (patch.cityFee !== undefined) entity.cityFee = patch.cityFee.toFixed(2);
    if (patch.isActive !== undefined) entity.isActive = patch.isActive;
    const saved = await repo.save(entity);
    return serializeLocation(saved as LocationEntity);
  },

  async deactivateLocation(id: string) {
    return this.updateLocation(id, { isActive: false });
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  async listSettings() {
    const rows = await AppDataSource.getRepository(AppSettingEntity).find();
    return (rows as any[]).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt }));
  },

  /**
   * Upsert a setting.
   * Uses update() for existing rows (works with the fake repo which keys on `key` field)
   * and save() for new ones.
   */
  async updateSetting(key: string, value: unknown, updatedBy: string) {
    const repo = AppDataSource.getRepository(AppSettingEntity);
    const now = new Date();
    const existing = await repo.findOne({ where: { key } as any });
    if (existing) {
      await (repo as any).update({ key }, { value, updatedBy, updatedAt: now });
    } else {
      await repo.save(repo.create({ key, value, updatedBy, updatedAt: now } as any));
    }
    // Re-fetch to return the authoritative value
    const updated = await repo.findOne({ where: { key } as any });
    return { key, value: updated?.value ?? value, updatedAt: updated?.updatedAt ?? now };
  },
};
