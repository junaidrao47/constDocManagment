import { In } from "typeorm";
import { AppDataSource } from "../../config/database";
import { ServiceEntity } from "../../entities/service.entity";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { HttpError } from "../../utils/http-error";
import { categoryService } from "../categories/category.service";
import { removeCatalogObject, saveCatalogObject } from "../../utils/s3";
import { PackageEntity } from "./package.entity";

export interface PackageInput {
  name: string;
  nameEn: string;
  nameEs?: string;
  descriptionEn?: string | null;
  descriptionEs?: string | null;
  type: string;
  price: number;
  durationDays: number;
  categoryId: string;
  serviceIds: string[];
  description?: string | null;
  sortOrder: number;
  isFeatured: boolean;
}

function serializePackage(pkg: PackageEntity) {
  return {
    id: pkg.id,
    name: pkg.name,
    nameEn: pkg.nameEn,
    nameEs: pkg.nameEs,
    descriptionEn: pkg.descriptionEn ?? null,
    descriptionEs: pkg.descriptionEs ?? null,
    type: pkg.type,
    price: Number(pkg.price),
    durationDays: pkg.durationDays,
    description: pkg.description ?? null,
    imageUrl: pkg.imageUrl ?? null,
    isActive: pkg.isActive,
    isFeatured: pkg.isFeatured,
    sortOrder: pkg.sortOrder,
    categoryId: pkg.categoryId,
    services: (pkg.services ?? []).map((service) => ({ id: service.id, name: service.name, description: service.description ?? null, basePrice: Number(service.basePrice) })),
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };
}

async function findPackageOr404(id: string) {
  const pkg = await AppDataSource.getRepository(PackageEntity).findOne({ where: { id }, relations: { services: true } });
  if (!pkg) throw new HttpError(404, "Package not found");
  return pkg;
}

async function resolveServices(serviceIds: string[]) {
  const uniqueIds = [...new Set(serviceIds)];
  if (uniqueIds.length !== serviceIds.length) throw new HttpError(400, "serviceIds must be unique");
  if (uniqueIds.length === 0) return [];
  // find({ id: In(...) }) rather than the deprecated findByIds, which TypeORM 0.3
  // marks for removal and which no repository contract outside TypeORM implements.
  const services = await AppDataSource.getRepository(ServiceEntity).find({ where: { id: In(uniqueIds) } });
  const activeServices = services.filter((service) => service.isActive);
  if (activeServices.length !== uniqueIds.length) throw new HttpError(400, "One or more selected services are unavailable");
  return activeServices;
}

export const packageService = {
  /**
   * Every package, active or retired, in the same order the public list uses.
   *
   * Deliberately unfiltered: an admin has to be able to see what they have
   * retired in order to bring it back.
   */
  async list() {
    const packages = await AppDataSource.getRepository(PackageEntity).find({
      relations: { services: true },
      order: { isFeatured: "DESC", sortOrder: "ASC", name: "ASC" },
    });
    return packages.map(serializePackage);
  },
  async get(id: string) { return serializePackage(await findPackageOr404(id)); },
  async create(input: PackageInput) {
    await categoryService.assertActiveCategory(input.categoryId);
    // isActive is set here rather than left to the column default. A new package
    // is active by definition, and stating it means the created row does not
    // depend on which layer fills the default in.
    const pkg = AppDataSource.getRepository(PackageEntity).create({
      name: input.name,
      nameEn: input.nameEn,
      nameEs: input.nameEs ?? input.nameEn,
      descriptionEn: input.descriptionEn ?? null,
      descriptionEs: input.descriptionEs ?? input.descriptionEn ?? null,
      type: input.type,
      price: input.price.toFixed(2),
      durationDays: input.durationDays,
      categoryId: input.categoryId,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      isFeatured: input.isFeatured,
      isActive: true,
      services: await resolveServices(input.serviceIds),
    });
    const saved = await AppDataSource.getRepository(PackageEntity).save(pkg);
    return this.get(saved.id);
  },
  async update(id: string, input: PackageInput) {
    const repository = AppDataSource.getRepository(PackageEntity);
    const pkg = await findPackageOr404(id);
    await categoryService.assertActiveCategory(input.categoryId);
    // description, sortOrder and isFeatured are assigned here too: create persists them
    // via its spread, but leaving them out of this list meant an edit silently dropped
    // them while the schema still accepted them. isActive stays out — see setStatus.
    Object.assign(pkg, {
      name: input.name,
      nameEn: input.nameEn,
      nameEs: input.nameEs ?? input.nameEn,
      descriptionEn: input.descriptionEn ?? null,
      descriptionEs: input.descriptionEs ?? input.descriptionEn ?? null,
      type: input.type,
      price: input.price.toFixed(2),
      durationDays: input.durationDays,
      categoryId: input.categoryId,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      isFeatured: input.isFeatured,
      services: await resolveServices(input.serviceIds),
    });
    await repository.save(pkg);
    return this.get(id);
  },
  /**
   * Retires or restores a package. Retiring drops it from the public catalogue while
   * leaving it in the database for the subscriptions that reference it; restoring is
   * the way back, which is why the admin list is unfiltered.
   */
  async setStatus(id: string, isActive: boolean) {
    const repository = AppDataSource.getRepository(PackageEntity);
    const pkg = await findPackageOr404(id);
    pkg.isActive = isActive;
    await repository.save(pkg);
    return this.get(id);
  },
  /**
   * Stores (or replaces) the package's marketing image. Reuses the catalog object store
   * (`packages/<id>/main/...`), so the existing `/api/public/catalog/images/*` route serves
   * it with no new serving code. The previous object, if any, is deleted after the row is
   * saved so a failed save never orphans the live image.
   */
  async setImage(id: string, file: { buffer: Buffer; originalName: string; mimeType: string }) {
    const repository = AppDataSource.getRepository(PackageEntity);
    const pkg = await findPackageOr404(id);
    const previousKey = pkg.imageKey ?? null;
    const { key, url } = await saveCatalogObject(pkg.id, "package", file.originalName, file.buffer, file.mimeType, "main");
    pkg.imageUrl = url;
    pkg.imageKey = key;
    await repository.save(pkg);
    if (previousKey && previousKey !== key) await removeCatalogObject(previousKey);
    return this.get(id);
  },
  async removeImage(id: string) {
    const repository = AppDataSource.getRepository(PackageEntity);
    const pkg = await findPackageOr404(id);
    const previousKey = pkg.imageKey ?? null;
    pkg.imageUrl = null;
    pkg.imageKey = null;
    await repository.save(pkg);
    if (previousKey) await removeCatalogObject(previousKey);
    return this.get(id);
  },
  async remove(id: string) {
    const pkg = await findPackageOr404(id);
    const subscriptionCount = await AppDataSource.getRepository(SubscriptionEntity).count({ where: { packageId: id } });
    if (subscriptionCount > 0) throw new HttpError(409, "Package cannot be deleted while subscriptions reference it");
    await AppDataSource.getRepository(PackageEntity).remove(pkg);
    return { id, deleted: true };
  },
};
