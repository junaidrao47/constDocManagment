import { z } from "zod";
import { CatalogFieldType, CatalogItemStatus } from "./catalog.entity";

const uuid = z.string().uuid();
const slug = z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a URL-safe slug");
const jsonObject = z.record(z.unknown());

export const CatalogCategorySchema = z.object({
  name: z.string().trim().min(1).max(150),
  slug,
  parentId: uuid.nullable().optional(),
  isActive: z.boolean().optional().default(true),
});
export const CatalogCategoryPatchSchema = CatalogCategorySchema.partial();

export const CatalogItemSchema = z.object({
  categoryId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(150),
  slug,
  entityType: z.string().trim().min(1).max(50).default("service"),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  fullDescription: z.string().trim().max(100000).nullable().optional(),
  status: z.nativeEnum(CatalogItemStatus).optional().default(CatalogItemStatus.Draft),
  isFeatured: z.boolean().optional().default(false),
  price: z.coerce.number().finite().min(0).nullable().optional(),
  isPublished: z.boolean().optional().default(false),
  fields: jsonObject.optional().default({}),
});
export const CatalogItemPatchSchema = CatalogItemSchema.partial();

export const CatalogFieldSchema = z.object({
  entityType: z.string().trim().min(1).max(50),
  fieldName: z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, "must use snake_case"),
  fieldLabel: z.string().trim().min(1).max(150),
  fieldType: z.nativeEnum(CatalogFieldType),
  isRequired: z.boolean().optional().default(false),
  isSearchable: z.boolean().optional().default(false),
  isFilterable: z.boolean().optional().default(false),
  optionsJson: z.array(z.unknown()).nullable().optional(),
  validationRulesJson: jsonObject.nullable().optional(),
});

export const CatalogIdParamSchema = z.object({ id: uuid });
export const CatalogImageParamSchema = z.object({ id: uuid, imageId: uuid });

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(12);
const booleanQuery = z.preprocess((value) => value === undefined ? undefined : value === "true" || value === "1", z.boolean().optional());

export const CatalogListQuerySchema = z.object({
  page,
  limit,
  sort: z.enum(["createdAt", "title", "price", "updatedAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().max(150).optional(),
  category: z.string().trim().max(180).optional(),
  status: z.nativeEnum(CatalogItemStatus).optional(),
  featured: booleanQuery,
  published: booleanQuery,
  entityType: z.string().trim().max(50).optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
  field: z.string().trim().max(100).optional(),
  value: z.string().trim().max(500).optional(),
}).refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
  message: "minPrice cannot exceed maxPrice",
  path: ["minPrice"],
});

export const CatalogImageSchema = z.object({
  entityType: z.string().trim().min(1).max(50).default("service"),
  isPrimary: z.coerce.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional().default(0),
  altText: z.string().trim().max(255).nullable().optional(),
});

export type CatalogListQuery = z.infer<typeof CatalogListQuerySchema>;
export type CatalogItemInput = z.infer<typeof CatalogItemSchema>;
