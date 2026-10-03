import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";

export enum CatalogItemStatus {
  Draft = "draft",
  Active = "active",
  Archived = "archived",
}

export enum CatalogFieldType {
  Text = "text",
  Textarea = "textarea",
  Number = "number",
  Decimal = "decimal",
  Boolean = "boolean",
  Select = "select",
  Multiselect = "multiselect",
  Date = "date",
  File = "file",
  Image = "image",
  RichText = "rich_text",
}

@Entity({ name: "catalog_categories" })
export class CatalogCategoryEntity extends AppBaseEntity {
  @Column({ type: "varchar", length: 150 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 180 })
  slug!: string;

  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId?: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @ManyToOne(() => CatalogCategoryEntity, (category) => category.children, { onDelete: "SET NULL" })
  @JoinColumn({ name: "parent_id" })
  parent?: CatalogCategoryEntity | null;

  @OneToMany(() => CatalogCategoryEntity, (category) => category.parent)
  children?: CatalogCategoryEntity[];

  @OneToMany(() => CatalogItemEntity, (item) => item.category)
  items?: CatalogItemEntity[];
}

@Entity({ name: "catalog_items" })
@Index(["categoryId", "isPublished"])
export class CatalogItemEntity extends AppBaseEntity {
  @Column({ name: "category_id", type: "uuid", nullable: true })
  categoryId?: string | null;

  @Column({ type: "varchar", length: 150 })
  title!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 180 })
  slug!: string;

  @Column({ name: "short_description", type: "varchar", length: 500, nullable: true })
  shortDescription?: string | null;

  @Column({ name: "full_description", type: "text", nullable: true })
  fullDescription?: string | null;

  @Column({ type: "varchar", length: 30, default: CatalogItemStatus.Draft })
  status!: CatalogItemStatus;

  @Column({ name: "entity_type", type: "varchar", length: 50, default: "service" })
  entityType!: string;

  @Column({ name: "is_featured", type: "boolean", default: false })
  isFeatured!: boolean;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  price?: string | null;

  @Column({ name: "is_published", type: "boolean", default: false })
  isPublished!: boolean;

  @ManyToOne(() => CatalogCategoryEntity, (category) => category.items, { onDelete: "SET NULL" })
  @JoinColumn({ name: "category_id" })
  category?: CatalogCategoryEntity | null;

  @OneToMany(() => CatalogFieldValueEntity, (value) => value.item, { cascade: true })
  fieldValues?: CatalogFieldValueEntity[];

  @OneToMany(() => CatalogImageEntity, (image) => image.item, { cascade: true })
  images?: CatalogImageEntity[];
}

@Entity({ name: "catalog_fields" })
@Index(["entityType", "fieldName"], { unique: true })
export class CatalogFieldEntity extends AppBaseEntity {
  @Column({ name: "entity_type", type: "varchar", length: 50 })
  entityType!: string;

  @Column({ name: "field_name", type: "varchar", length: 100 })
  fieldName!: string;

  @Column({ name: "field_label", type: "varchar", length: 150 })
  fieldLabel!: string;

  @Column({ name: "field_type", type: "varchar", length: 30 })
  fieldType!: CatalogFieldType;

  @Column({ name: "is_required", type: "boolean", default: false })
  isRequired!: boolean;

  @Column({ name: "is_searchable", type: "boolean", default: false })
  isSearchable!: boolean;

  @Column({ name: "is_filterable", type: "boolean", default: false })
  isFilterable!: boolean;

  @Column({ name: "options_json", type: "jsonb", nullable: true })
  optionsJson?: unknown[] | null;

  @Column({ name: "validation_rules_json", type: "jsonb", nullable: true })
  validationRulesJson?: Record<string, unknown> | null;

  @OneToMany(() => CatalogFieldValueEntity, (value) => value.field)
  values?: CatalogFieldValueEntity[];
}

@Entity({ name: "catalog_field_values" })
@Index(["itemId", "fieldId"], { unique: true })
export class CatalogFieldValueEntity extends AppBaseEntity {
  @Column({ name: "item_id", type: "uuid" })
  itemId!: string;

  @Column({ name: "field_id", type: "uuid" })
  fieldId!: string;

  @Column({ name: "value_json", type: "jsonb" })
  valueJson!: unknown;

  @ManyToOne(() => CatalogItemEntity, (item) => item.fieldValues, { onDelete: "CASCADE" })
  @JoinColumn({ name: "item_id" })
  item!: CatalogItemEntity;

  @ManyToOne(() => CatalogFieldEntity, (field) => field.values, { onDelete: "CASCADE" })
  @JoinColumn({ name: "field_id" })
  field!: CatalogFieldEntity;
}

@Entity({ name: "catalog_images" })
@Index(["itemId", "sortOrder"])
export class CatalogImageEntity extends AppBaseEntity {
  @Column({ name: "item_id", type: "uuid" })
  itemId!: string;

  @Column({ name: "entity_type", type: "varchar", length: 50 })
  entityType!: string;

  @Column({ name: "image_url", type: "varchar", length: 1024 })
  imageUrl!: string;

  @Column({ name: "storage_key", type: "varchar", length: 512 })
  storageKey!: string;

  @Column({ name: "is_primary", type: "boolean", default: false })
  isPrimary!: boolean;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "alt_text", type: "varchar", length: 255, nullable: true })
  altText?: string | null;

  @ManyToOne(() => CatalogItemEntity, (item) => item.images, { onDelete: "CASCADE" })
  @JoinColumn({ name: "item_id" })
  item!: CatalogItemEntity;
}
