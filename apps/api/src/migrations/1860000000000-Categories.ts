import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The category layer (PROJECT-BRIEF §10.1): every service and every package
 * belongs to exactly one required category.
 *
 * Designed to run on a database that already has services and packages. The
 * sequence is deliberate so it never violates a constraint mid-flight:
 *   1. create `categories` (genuinely new -> IF NOT EXISTS is correct here, same
 *      reasoning as 1850000000000-AgentCustomerAssignments).
 *   2. add the bilingual + category_id columns NULLABLE.
 *   3. insert the default "General / General" category.
 *   4. backfill every existing row to General and copy name/description into the
 *      _en fields, then _es from _en (es copy is flagged for translation review in
 *      the decision log; there is no schema flag for it).
 *   5. only then SET NOT NULL, so existing data satisfies the constraint.
 *
 * This is a NEW table / NEW columns, so the no-op `CREATE TABLE IF NOT EXISTS`
 * warning in the decision log (which is about correcting an already-created table)
 * does not apply.
 *
 * The services and packages statements are written out per table (rather than a
 * loop) on purpose: the repo's drift tooling and any human reader diff the literal
 * `ALTER TABLE "services" ... ADD COLUMN "name_en"` text, so an interpolated table
 * name would read as untracked drift even though the column exists.
 */
export class Categories1860000000000 implements MigrationInterface {
  name = "Categories1860000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. categories table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "slug" varchar(180) NOT NULL,
        "name_en" varchar(150) NOT NULL,
        "name_es" varchar(150) NOT NULL,
        "description_en" text,
        "description_es" text,
        "icon" varchar(60),
        "image_url" varchar(1024),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_categories_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_categories_slug" ON "categories" ("slug")`);

    // 2. bilingual + category_id columns, NULLABLE for now
    await queryRunner.query(`
      ALTER TABLE "services"
        ADD COLUMN IF NOT EXISTS "name_en" varchar(150),
        ADD COLUMN IF NOT EXISTS "name_es" varchar(150),
        ADD COLUMN IF NOT EXISTS "description_en" text,
        ADD COLUMN IF NOT EXISTS "description_es" text,
        ADD COLUMN IF NOT EXISTS "category_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "packages"
        ADD COLUMN IF NOT EXISTS "name_en" varchar(150),
        ADD COLUMN IF NOT EXISTS "name_es" varchar(150),
        ADD COLUMN IF NOT EXISTS "description_en" text,
        ADD COLUMN IF NOT EXISTS "description_es" text,
        ADD COLUMN IF NOT EXISTS "category_id" uuid
    `);

    // 3. default category
    await queryRunner.query(`
      INSERT INTO "categories" ("slug", "name_en", "name_es", "description_en", "description_es", "sort_order")
      VALUES ('general', 'General', 'General', 'Uncategorised services and packages.', 'Servicios y paquetes sin categoría.', 0)
      ON CONFLICT ("slug") DO NOTHING
    `);

    // 4. backfill existing rows (idempotent: only rows not yet migrated)
    await queryRunner.query(`
      UPDATE "services" SET
        "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'general'),
        "name_en" = COALESCE("name_en", "name"),
        "name_es" = COALESCE("name_es", "name"),
        "description_en" = COALESCE("description_en", "description"),
        "description_es" = COALESCE("description_es", "description")
      WHERE "category_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "packages" SET
        "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'general'),
        "name_en" = COALESCE("name_en", "name"),
        "name_es" = COALESCE("name_es", "name"),
        "description_en" = COALESCE("description_en", "description"),
        "description_es" = COALESCE("description_es", "description")
      WHERE "category_id" IS NULL
    `);

    // 5. FK (ON DELETE RESTRICT) + tighten NOT NULL now that data satisfies it
    await queryRunner.query(`
      ALTER TABLE "services"
        DROP CONSTRAINT IF EXISTS "FK_services_category",
        ADD CONSTRAINT "FK_services_category"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "services"
        ALTER COLUMN "category_id" SET NOT NULL,
        ALTER COLUMN "name_en" SET NOT NULL,
        ALTER COLUMN "name_es" SET NOT NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_services_category_id" ON "services" ("category_id")`);

    await queryRunner.query(`
      ALTER TABLE "packages"
        DROP CONSTRAINT IF EXISTS "FK_packages_category",
        ADD CONSTRAINT "FK_packages_category"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "packages"
        ALTER COLUMN "category_id" SET NOT NULL,
        ALTER COLUMN "name_en" SET NOT NULL,
        ALTER COLUMN "name_es" SET NOT NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_packages_category_id" ON "packages" ("category_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_services_category_id"`);
    await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "FK_services_category"`);
    await queryRunner.query(`
      ALTER TABLE "services"
        DROP COLUMN IF EXISTS "category_id",
        DROP COLUMN IF EXISTS "name_en",
        DROP COLUMN IF EXISTS "name_es",
        DROP COLUMN IF EXISTS "description_en",
        DROP COLUMN IF EXISTS "description_es"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packages_category_id"`);
    await queryRunner.query(`ALTER TABLE "packages" DROP CONSTRAINT IF EXISTS "FK_packages_category"`);
    await queryRunner.query(`
      ALTER TABLE "packages"
        DROP COLUMN IF EXISTS "category_id",
        DROP COLUMN IF EXISTS "name_en",
        DROP COLUMN IF EXISTS "name_es",
        DROP COLUMN IF EXISTS "description_en",
        DROP COLUMN IF EXISTS "description_es"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_categories_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
  }
}
