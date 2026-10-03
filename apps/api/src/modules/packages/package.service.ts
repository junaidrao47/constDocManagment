import { AppDataSource } from "../../config/database";
import { ServiceEntity } from "../../entities/service.entity";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { HttpError } from "../../utils/http-error";
import { PackageEntity } from "./package.entity";

export interface PackageInput {
  name: string;
  type: string;
  price: number;
  durationDays: number;
  serviceIds: string[];
}

function serializePackage(pkg: PackageEntity) {
  return {
    id: pkg.id,
    name: pkg.name,
    type: pkg.type,
    price: Number(pkg.price),
    durationDays: pkg.durationDays,
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
  const services = await AppDataSource.getRepository(ServiceEntity).findByIds(uniqueIds);
  const activeServices = services.filter((service) => service.isActive);
  if (activeServices.length !== uniqueIds.length) throw new HttpError(400, "One or more selected services are unavailable");
  return activeServices;
}

export const packageService = {
  async list() {
    const packages = await AppDataSource.getRepository(PackageEntity).find({ relations: { services: true }, order: { name: "ASC" } });
    return packages.map(serializePackage);
  },
  async get(id: string) { return serializePackage(await findPackageOr404(id)); },
  async create(input: PackageInput) {
    const pkg = AppDataSource.getRepository(PackageEntity).create({ ...input, price: input.price.toFixed(2), services: await resolveServices(input.serviceIds) });
    const saved = await AppDataSource.getRepository(PackageEntity).save(pkg);
    return this.get(saved.id);
  },
  async update(id: string, input: PackageInput) {
    const repository = AppDataSource.getRepository(PackageEntity);
    const pkg = await findPackageOr404(id);
    Object.assign(pkg, { name: input.name, type: input.type, price: input.price.toFixed(2), durationDays: input.durationDays, services: await resolveServices(input.serviceIds) });
    await repository.save(pkg);
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
