import { AppDataSource } from "../../config/database";
import { ServiceEntity } from "../../entities/service.entity";
import { PackageEntity } from "../packages/package.entity";
import { AppError, HttpError } from "../../utils/http-error";
import { Locale, pickLocale } from "../../utils/i18n";
import { CategoryEntity } from "./category.entity";

export interface CategoryInput {
  slug: string;
  nameEn: string;
  nameEs: string;
  descriptionEn?: string | null;
  descriptionEs?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
}

export type CategoryPatch = Partial<CategoryInput>;

function serializeCategory(c: CategoryEntity) {
  return {
    id: c.id,
    slug: c.slug,
    nameEn: c.nameEn,
    nameEs: c.nameEs,
    descriptionEn: c.descriptionEn ?? null,
    descriptionEs: c.descriptionEs ?? null,
    icon: c.icon ?? null,
    imageUrl: c.imageUrl ?? null,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** The shape embedded on each public service/package item. */
export function serializePublicCategory(c: CategoryEntity, locale: Locale) {
  return {
    id: c.id,
    slug: c.slug,
    name: pickLocale(locale, c.nameEn, c.nameEs),
    description: pickLocale(locale, c.descriptionEn, c.descriptionEs),
    icon: c.icon ?? null,
    imageUrl: c.imageUrl ?? null,
  };
}

const repo = () => AppDataSource.getRepository(CategoryEntity);

async function findOr404(id: string): Promise<CategoryEntity> {
  const category = await repo().findOne({ where: { id } });
  if (!category) throw new HttpError(404, "Category not found");
  return category;
}

async function assertSlugFree(slug: string, exceptId?: string): Promise<void> {
  const existing = await repo().findOne({ where: { slug } });
  if (existing && existing.id !== exceptId) {
    throw new AppError("CONFLICT", 409, `A category with slug "${slug}" already exists`);
  }
}

export const categoryService = {
  /** Admin list: every category, in display order. */
  async list() {
    const rows = await repo().find({ order: { sortOrder: "ASC", nameEs: "ASC" } });
    return rows.map(serializeCategory);
  },

  async get(id: string) {
    return serializeCategory(await findOr404(id));
  },

  async create(input: CategoryInput) {
    await assertSlugFree(input.slug);
    const entity = repo().create({
      slug: input.slug,
      nameEn: input.nameEn,
      nameEs: input.nameEs,
      descriptionEn: input.descriptionEn ?? null,
      descriptionEs: input.descriptionEs ?? null,
      icon: input.icon ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder,
      isActive: true,
    });
    const saved = await repo().save(entity);
    return serializeCategory(saved as CategoryEntity);
  },

  async update(id: string, patch: CategoryPatch) {
    const entity = await findOr404(id);
    if (patch.slug !== undefined && patch.slug !== entity.slug) await assertSlugFree(patch.slug, id);
    if (patch.slug !== undefined) entity.slug = patch.slug;
    if (patch.nameEn !== undefined) entity.nameEn = patch.nameEn;
    if (patch.nameEs !== undefined) entity.nameEs = patch.nameEs;
    if (patch.descriptionEn !== undefined) entity.descriptionEn = patch.descriptionEn ?? null;
    if (patch.descriptionEs !== undefined) entity.descriptionEs = patch.descriptionEs ?? null;
    if (patch.icon !== undefined) entity.icon = patch.icon ?? null;
    if (patch.imageUrl !== undefined) entity.imageUrl = patch.imageUrl ?? null;
    if (patch.sortOrder !== undefined) entity.sortOrder = patch.sortOrder;
    const saved = await repo().save(entity);
    return serializeCategory(saved as CategoryEntity);
  },

  async setStatus(id: string, isActive: boolean) {
    const entity = await findOr404(id);
    entity.isActive = isActive;
    const saved = await repo().save(entity);
    return serializeCategory(saved as CategoryEntity);
  },

  /** Assigns sort_order by position in orderedIds. Unknown ids 404. */
  async reorder(orderedIds: string[]) {
    const rows = await repo().find();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = orderedIds.find((id) => !byId.has(id));
    if (missing) throw new HttpError(404, `Category not found: ${missing}`);
    let order = 0;
    for (const id of orderedIds) {
      const row = byId.get(id)!;
      row.sortOrder = order;
      order += 1;
      await repo().save(row);
    }
    return this.list();
  },

  async remove(id: string) {
    const category = await findOr404(id);
    const [serviceCount, packageCount] = await Promise.all([
      AppDataSource.getRepository(ServiceEntity).count({ where: { categoryId: id } }),
      AppDataSource.getRepository(PackageEntity).count({ where: { categoryId: id } }),
    ]);
    if (serviceCount + packageCount > 0) {
      throw new AppError(
        "CATEGORY_NOT_EMPTY",
        409,
        `Category still has ${serviceCount} service(s) and ${packageCount} package(s); deactivate it instead of deleting.`,
      );
    }
    await repo().remove(category);
    return { id, deleted: true };
  },

  /**
   * Guard used by service/package create/update: the category must exist and be
   * active. Throws a precise code so the frontend can distinguish the cases.
   */
  async assertActiveCategory(id: string): Promise<CategoryEntity> {
    const category = await repo().findOne({ where: { id } });
    if (!category) throw new AppError("CATEGORY_NOT_FOUND", 400, "The selected category does not exist");
    if (!category.isActive) throw new AppError("CATEGORY_INACTIVE", 400, "The selected category is inactive");
    return category;
  },

  /** Public list: active categories with how many live services/packages each holds. */
  async listPublic(locale: Locale) {
    const rows = await repo().find({ where: { isActive: true }, order: { sortOrder: "ASC", nameEs: "ASC" } });
    const serviceRepo = AppDataSource.getRepository(ServiceEntity);
    const packageRepo = AppDataSource.getRepository(PackageEntity);
    return Promise.all(
      rows.map(async (c) => {
        const [serviceCount, packageCount] = await Promise.all([
          serviceRepo.count({ where: { categoryId: c.id, isActive: true } }),
          packageRepo.count({ where: { categoryId: c.id, isActive: true } }),
        ]);
        return { ...serializePublicCategory(c, locale), serviceCount, packageCount };
      }),
    );
  },

  /** Resolve a public `?category=<slug>` filter to a category id, or null when absent. */
  async idForSlug(slug: string): Promise<string | null> {
    const category = await repo().findOne({ where: { slug } });
    return category?.id ?? null;
  },
};
