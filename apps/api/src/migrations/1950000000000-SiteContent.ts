import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * CMS site content: editable bilingual copy, one row per (content_key, locale), plus an
 * append-only publish history. Keys are constrained in code by the content registry, not by
 * the schema, so adding a new editable string never needs a migration. Literal table names
 * so the drift tooling can attribute the columns (see the CLAUDE.md gotcha).
 */
export class SiteContent1950000000000 implements MigrationInterface {
  name = "SiteContent1950000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "site_content" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "content_key" varchar(150) NOT NULL,
        "locale" varchar(10) NOT NULL,
        "value" text NOT NULL DEFAULT '',
        "status" varchar(20) NOT NULL DEFAULT 'draft',
        "font_family" varchar(50),
        "font_weight" integer,
        "size_step" varchar(5),
        "version" integer NOT NULL DEFAULT 1,
        "updated_by" uuid,
        CONSTRAINT "PK_site_content" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_site_content_key_locale" ON "site_content" ("content_key", "locale")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "site_content_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "content_key" varchar(150) NOT NULL,
        "locale" varchar(10) NOT NULL,
        "value" text NOT NULL,
        "version" integer NOT NULL,
        "published_by" uuid,
        CONSTRAINT "PK_site_content_history" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_site_content_history_key" ON "site_content_history" ("content_key", "locale", "version")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_site_content_history_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_content_history"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_site_content_key_locale"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_content"`);
  }
}
