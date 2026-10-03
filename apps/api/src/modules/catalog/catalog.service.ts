import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { removeCatalogObject, saveCatalogObject } from "../../utils/s3";
import {
  CatalogCategoryEntity,
  CatalogFieldEntity,
  CatalogFieldType,
  CatalogImageEntity,
  CatalogItemEntity,
  CatalogItemStatus,
} from "./catalog.entity";
import type { CatalogItemInput, CatalogListQuery } from "./catalog.schema";

function serializeField(field: CatalogFieldEntity) {
  return {
    id: field.id,
    entityType: field.entityType,
    fieldName: field.fieldName,
    fieldLabel: field.fieldLabel,
    fieldType: field.fieldType,
    isRequired: field.isRequired,
    isSearchable: field.isSearchable,
    isFilterable: field.isFilterable,
    options: field.optionsJson ?? [],
    validationRules: field.validationRulesJson ?? {},
  };
}

function serializeItem(item: CatalogItemEntity) {
  return {
    id: item.id,
    category: item.category ? { id: item.category.id, name: item.category.name, slug: item.category.slug } : null,
    title: item.title,
    slug: item.slug,
    entityType: item.entityType,
    shortDescription: item.shortDescription ?? null,
    fullDescription: item.fullDescription ?? null,
    status: item.status,
    isFeatured: item.isFeatured,
    price: item.price == null ? null : Number(item.price),
    isPublished: item.isPublished,
    fields: Object.fromEntries((item.fieldValues ?? []).map((value) => [value.field.fieldName, value.valueJson])),
    images: (item.images ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((image) => ({
      id: image.id,
      entityType: image.entityType,
      imageUrl: image.imageUrl,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
      altText: image.altText ?? null,
    })),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function findItem(id: string) {
  const item = await AppDataSource.getRepository(CatalogItemEntity).findOne({
    where: { id },
    relations: { category: true, fieldValues: { field: true }, images: true },
  });
  if (!item) throw new HttpError(404, "Catalog item not found");
  return item;
}

async function findCategory(id: string | null | undefined) {
  if (!id) return null;
  const category = await AppDataSource.getRepository(CatalogCategoryEntity).findOne({ where: { id } });
  if (!category) throw new HttpError(400, "Category not found");
  return category;
}

async function validateFields(entityType: string, fields: Record<string, unknown>) {
  const definitions = await AppDataSource.getRepository(CatalogFieldEntity).find({ where: { entityType } });
  const byName = new Map(definitions.map((field) => [field.fieldName, field]));
  for (const [name, value] of Object.entries(fields)) {
    const definition = byName.get(name);
    if (!definition) throw new HttpError(400, `Unknown catalog field: ${name}`);
    if (definition.fieldType === CatalogFieldType.Multiselect && !Array.isArray(value)) {
      throw new HttpError(400, `${name} must be an array`);
    }
    if (definition.fieldType === CatalogFieldType.Boolean && typeof value !== "boolean") {
      throw new HttpError(400, `${name} must be a boolean`);
    }
  }
  for (const definition of definitions) {
    if (definition.isRequired && (fields[definition.fieldName] === undefined || fields[definition.fieldName] === null || fields[definition.fieldName] === "")) {
      throw new HttpError(400, `${definition.fieldName} is required`);
    }
  }
  return definitions;
}

async function saveFieldValues(itemId: string, entityType: string, fields: Record<string, unknown>) {
  const definitions = await validateFields(entityType, fields);
  const valueRepository = AppDataSource.getRepository("CatalogFieldValueEntity");
  await valueRepository.delete({ itemId });
  const fieldByName = new Map(definitions.map((field) => [field.fieldName, field]));
  const values = Object.entries(fields).map(([fieldName, valueJson]) => valueRepository.create({
    itemId,
    fieldId: fieldByName.get(fieldName)!.id,
    valueJson,
  }));
  if (values.length > 0) await valueRepository.save(values);
}

export const catalogService = {
  async listCategories() {
    const categories = await AppDataSource.getRepository(CatalogCategoryEntity).find({ order: { name: "ASC" } });
    return categories.map((category) => ({ id: category.id, name: category.name, slug: category.slug, parentId: category.parentId, isActive: category.isActive }));
  },

  async getCategory(id: string) {
    const category = await AppDataSource.getRepository(CatalogCategoryEntity).findOne({ where: { id }, relations: { parent: true } });
    if (!category) throw new HttpError(404, "Catalog category not found");
    return { id: category.id, name: category.name, slug: category.slug, parentId: category.parentId, isActive: category.isActive };
  },

  async createCategory(input: { name: string; slug: string; parentId?: string | null; isActive?: boolean }) {
    await findCategory(input.parentId);
    const category = AppDataSource.getRepository(CatalogCategoryEntity).create(input);
    return this.getCategory((await AppDataSource.getRepository(CatalogCategoryEntity).save(category)).id);
  },

  async updateCategory(id: string, input: Partial<{ name: string; slug: string; parentId: string | null; isActive: boolean }>) {
    const repository = AppDataSource.getRepository(CatalogCategoryEntity);
    const category = await repository.findOne({ where: { id } });
    if (!category) throw new HttpError(404, "Catalog category not found");
    if (input.parentId === id) throw new HttpError(400, "A category cannot be its own parent");
    await findCategory(input.parentId);
    Object.assign(category, input);
    await repository.save(category);
    return this.getCategory(id);
  },

  async deleteCategory(id: string) {
    const repository = AppDataSource.getRepository(CatalogCategoryEntity);
    const category = await repository.findOne({ where: { id } });
    if (!category) throw new HttpError(404, "Catalog category not found");
    await repository.remove(category);
    return { id, deleted: true };
  },

  async listFields(entityType?: string) {
    const fields = await AppDataSource.getRepository(CatalogFieldEntity).find({ where: entityType ? { entityType } : {}, order: { fieldLabel: "ASC" } });
    return fields.map(serializeField);
  },

  async createField(input: Omit<ReturnType<typeof serializeField>, "id" | "options" | "validationRules"> & { optionsJson?: unknown[] | null; validationRulesJson?: Record<string, unknown> | null }) {
    const field = AppDataSource.getRepository(CatalogFieldEntity).create(input);
    return serializeField(await AppDataSource.getRepository(CatalogFieldEntity).save(field));
  },

  async updateField(id: string, input: Partial<Omit<ReturnType<typeof serializeField>, "id" | "options" | "validationRules">> & { optionsJson?: unknown[] | null; validationRulesJson?: Record<string, unknown> | null }) {
    const repository = AppDataSource.getRepository(CatalogFieldEntity);
    const field = await repository.findOne({ where: { id } });
    if (!field) throw new HttpError(404, "Catalog field not found");
    Object.assign(field, input);
    return serializeField(await repository.save(field));
  },

  async listItems(query: CatalogListQuery, publicOnly = false) {
    const repository = AppDataSource.getRepository(CatalogItemEntity);
    const builder = repository.createQueryBuilder("item")
      .leftJoinAndSelect("item.category", "category")
      .leftJoinAndSelect("item.fieldValues", "fieldValue")
      .leftJoinAndSelect("fieldValue.field", "field")
      .leftJoinAndSelect("item.images", "image");

    if (publicOnly) builder.andWhere("item.is_published = true").andWhere("item.status = :activeStatus", { activeStatus: CatalogItemStatus.Active });
    if (query.category) builder.andWhere("category.slug = :category", { category: query.category });
    if (query.status) builder.andWhere("item.status = :status", { status: query.status });
    if (query.entityType) builder.andWhere("item.entity_type = :entityType", { entityType: query.entityType });
    if (query.featured !== undefined) builder.andWhere("item.is_featured = :featured", { featured: query.featured });
    if (query.published !== undefined && !publicOnly) builder.andWhere("item.is_published = :published", { published: query.published });
    if (query.minPrice !== undefined) builder.andWhere("item.price >= :minPrice", { minPrice: query.minPrice });
    if (query.maxPrice !== undefined) builder.andWhere("item.price <= :maxPrice", { maxPrice: query.maxPrice });
    if (query.search) builder.andWhere("(item.title ILIKE :search OR item.short_description ILIKE :search OR item.full_description ILIKE :search)", { search: `%${query.search}%` });
    if (query.field && query.value) builder.andWhere("field.field_name = :fieldName AND fieldValue.value_json::text ILIKE :fieldValue", { fieldName: query.field, fieldValue: `%${query.value}%` });

    const sortColumns = { createdAt: "item.created_at", title: "item.title", price: "item.price", updatedAt: "item.updated_at" } as const;
    builder.orderBy(sortColumns[query.sort], query.order.toUpperCase() as "ASC" | "DESC");
    const [items, total] = await builder.skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    const totalPages = Math.ceil(total / query.limit);
    return { data: items.map(serializeItem), total, page: query.page, totalPages, hasNext: query.page < totalPages };
  },

  async getItem(id: string, publicOnly = false) {
    const item = await findItem(id);
    if (publicOnly && (!item.isPublished || item.status !== CatalogItemStatus.Active)) throw new HttpError(404, "Catalog item not found");
    return serializeItem(item);
  },

  async createItem(input: CatalogItemInput) {
    await findCategory(input.categoryId);
    const item = AppDataSource.getRepository(CatalogItemEntity).create({ ...input, price: input.price == null ? null : input.price.toFixed(2) });
    const saved = await AppDataSource.getRepository(CatalogItemEntity).save(item);
    await saveFieldValues(saved.id, input.entityType, input.fields);
    return this.getItem(saved.id);
  },

  async updateItem(id: string, input: Partial<CatalogItemInput>) {
    const repository = AppDataSource.getRepository(CatalogItemEntity);
    const item = await findItem(id);
    if (input.categoryId !== undefined) await findCategory(input.categoryId);
    const entityType = input.entityType ?? item.entityType;
    const fields = input.fields ?? Object.fromEntries((item.fieldValues ?? []).map((value) => [value.field.fieldName, value.valueJson]));
    const nextValues = { ...input } as Record<string, unknown>;
    delete nextValues.fields;
    if (input.price !== undefined) nextValues.price = input.price == null ? null : input.price.toFixed(2);
    Object.assign(item, nextValues, { entityType });
    await repository.save(item);
    await saveFieldValues(id, entityType, fields);
    return this.getItem(id);
  },

  async analyticsSummary() {
    const itemRepository = AppDataSource.getRepository(CatalogItemEntity);
    const categoryRepository = AppDataSource.getRepository(CatalogCategoryEntity);
    const [totalItems, publishedItems, draftItems, featuredItems, totalCategories] = await Promise.all([
      itemRepository.count(),
      itemRepository.count({ where: { isPublished: true } }),
      itemRepository.count({ where: { status: CatalogItemStatus.Draft } }),
      itemRepository.count({ where: { isFeatured: true } }),
      categoryRepository.count({ where: { isActive: true } }),
    ]);
    const topCategories = await itemRepository.createQueryBuilder("item")
      .innerJoin("item.category", "category")
      .select("category.name", "name")
      .addSelect("COUNT(item.id)", "items")
      .groupBy("category.id")
      .addGroupBy("category.name")
      .orderBy("items", "DESC")
      .limit(5)
      .getRawMany<{ name: string; items: string }>();
    return { totalItems, publishedItems, draftItems, featuredItems, totalCategories, topCategories: topCategories.map((category) => ({ name: category.name, items: Number(category.items) })) };
  },

  async deleteItem(id: string) {
    const item = await findItem(id);
    await AppDataSource.getRepository(CatalogItemEntity).remove(item);
    return { id, deleted: true };
  },

  async addImage(itemId: string, file: { buffer: Buffer; originalName: string; mimeType: string }, input: { entityType: string; isPrimary: boolean; sortOrder: number; altText?: string | null }) {
    await findItem(itemId);
    const stored = await saveCatalogObject(itemId, input.entityType, file.originalName, file.buffer, file.mimeType, input.isPrimary ? "main" : "gallery");
    const repository = AppDataSource.getRepository(CatalogImageEntity);
    if (input.isPrimary) await repository.update({ itemId }, { isPrimary: false });
    const image = await repository.save(repository.create({ itemId, entityType: input.entityType, storageKey: stored.key, imageUrl: stored.url, isPrimary: input.isPrimary, sortOrder: input.sortOrder, altText: input.altText ?? null }));
    return { id: image.id, imageUrl: image.imageUrl, isPrimary: image.isPrimary, sortOrder: image.sortOrder, altText: image.altText };
  },

  async deleteImage(itemId: string, imageId: string) {
    const repository = AppDataSource.getRepository(CatalogImageEntity);
    const image = await repository.findOne({ where: { id: imageId, itemId } });
    if (!image) throw new HttpError(404, "Catalog image not found");
    await removeCatalogObject(image.storageKey);
    await repository.remove(image);
    return { id: imageId, deleted: true };
  },
};
