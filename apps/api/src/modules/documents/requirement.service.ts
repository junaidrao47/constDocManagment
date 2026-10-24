import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { ServiceEntity } from "../../entities/service.entity";
import { ServiceRequiredDocumentEntity } from "./service-required-document.entity";

export interface RequirementInput {
  nameEn: string;
  nameEs: string;
  descriptionEn?: string | null;
  descriptionEs?: string | null;
  isRequired: boolean;
  sortOrder: number;
  allowedMimeTypes?: string[] | null;
}

export type RequirementPatch = Partial<RequirementInput>;

function serialize(r: ServiceRequiredDocumentEntity) {
  return {
    id: r.id,
    serviceId: r.serviceId,
    nameEn: r.nameEn,
    nameEs: r.nameEs,
    descriptionEn: r.descriptionEn ?? null,
    descriptionEs: r.descriptionEs ?? null,
    isRequired: r.isRequired,
    sortOrder: r.sortOrder,
    allowedMimeTypes: r.allowedMimeTypes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const repo = () => AppDataSource.getRepository(ServiceRequiredDocumentEntity);

async function findOr404(id: string): Promise<ServiceRequiredDocumentEntity> {
  const row = await repo().findOne({ where: { id } });
  if (!row) throw new HttpError(404, "Requirement not found");
  return row;
}

async function assertServiceExists(serviceId: string): Promise<void> {
  const service = await AppDataSource.getRepository(ServiceEntity).findOne({ where: { id: serviceId } });
  if (!service) throw new HttpError(404, "Service not found");
}

export const requirementService = {
  async listForService(serviceId: string) {
    const rows = await repo().find({ where: { serviceId }, order: { sortOrder: "ASC", nameEs: "ASC" } });
    return rows.map(serialize);
  },

  async get(id: string) {
    return serialize(await findOr404(id));
  },

  async create(serviceId: string, input: RequirementInput) {
    await assertServiceExists(serviceId);
    const entity = repo().create({
      serviceId,
      nameEn: input.nameEn,
      nameEs: input.nameEs,
      descriptionEn: input.descriptionEn ?? null,
      descriptionEs: input.descriptionEs ?? null,
      isRequired: input.isRequired,
      sortOrder: input.sortOrder,
      allowedMimeTypes: input.allowedMimeTypes ?? null,
    });
    return serialize((await repo().save(entity)) as ServiceRequiredDocumentEntity);
  },

  async update(id: string, patch: RequirementPatch) {
    const entity = await findOr404(id);
    if (patch.nameEn !== undefined) entity.nameEn = patch.nameEn;
    if (patch.nameEs !== undefined) entity.nameEs = patch.nameEs;
    if (patch.descriptionEn !== undefined) entity.descriptionEn = patch.descriptionEn ?? null;
    if (patch.descriptionEs !== undefined) entity.descriptionEs = patch.descriptionEs ?? null;
    if (patch.isRequired !== undefined) entity.isRequired = patch.isRequired;
    if (patch.sortOrder !== undefined) entity.sortOrder = patch.sortOrder;
    if (patch.allowedMimeTypes !== undefined) entity.allowedMimeTypes = patch.allowedMimeTypes ?? null;
    return serialize((await repo().save(entity)) as ServiceRequiredDocumentEntity);
  },

  async remove(id: string) {
    const entity = await findOr404(id);
    await repo().remove(entity);
    return { id, deleted: true };
  },
};
