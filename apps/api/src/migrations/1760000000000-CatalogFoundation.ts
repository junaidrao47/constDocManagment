import { MigrationInterface, QueryRunner } from "typeorm";

export class CatalogFoundation1760000000000 implements MigrationInterface {
  name = "CatalogFoundation1760000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "catalog_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" varchar(150) NOT NULL,
        "slug" varchar(180) NOT NULL,
        "parent_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_catalog_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalog_categories_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_catalog_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "catalog_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "category_id" uuid,
        "title" varchar(150) NOT NULL,
        "slug" varchar(180) NOT NULL,
        "short_description" varchar(500),
        "full_description" text,
        "status" varchar(30) NOT NULL DEFAULT 'draft',
        "entity_type" varchar(50) NOT NULL DEFAULT 'service',
        "is_featured" boolean NOT NULL DEFAULT false,
        "price" numeric(12,2),
        "is_published" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_catalog_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalog_items_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_catalog_items_category" FOREIGN KEY ("category_id") REFERENCES "catalog_categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_catalog_items_category_published" ON "catalog_items" ("category_id", "is_published")`);
    await queryRunner.query(`
      CREATE TABLE "catalog_fields" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "entity_type" varchar(50) NOT NULL,
        "field_name" varchar(100) NOT NULL,
        "field_label" varchar(150) NOT NULL,
        "field_type" varchar(30) NOT NULL,
        "is_required" boolean NOT NULL DEFAULT false,
        "is_searchable" boolean NOT NULL DEFAULT false,
        "is_filterable" boolean NOT NULL DEFAULT false,
        "options_json" jsonb,
        "validation_rules_json" jsonb,
        CONSTRAINT "PK_catalog_fields_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalog_fields_entity_name" UNIQUE ("entity_type", "field_name")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "catalog_field_values" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "item_id" uuid NOT NULL,
        "field_id" uuid NOT NULL,
        "value_json" jsonb NOT NULL,
        CONSTRAINT "PK_catalog_field_values_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_catalog_field_values_item_field" UNIQUE ("item_id", "field_id"),
        CONSTRAINT "FK_catalog_field_values_item" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_catalog_field_values_field" FOREIGN KEY ("field_id") REFERENCES "catalog_fields"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "catalog_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "item_id" uuid NOT NULL,
        "entity_type" varchar(50) NOT NULL,
        "image_url" varchar(1024) NOT NULL,
        "storage_key" varchar(512) NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        "alt_text" varchar(255),
        CONSTRAINT "PK_catalog_images_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_catalog_images_item" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_catalog_images_item_sort" ON "catalog_images" ("item_id", "sort_order")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "catalog_images"`);
    await queryRunner.query(`DROP TABLE "catalog_field_values"`);
    await queryRunner.query(`DROP TABLE "catalog_fields"`);
    await queryRunner.query(`DROP TABLE "catalog_items"`);
    await queryRunner.query(`DROP TABLE "catalog_categories"`);
  }
}
