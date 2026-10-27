import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Homepage hero carousel slides.
 *
 * Public images (keys under the `public/hero/` S3 prefix); bilingual text; per-slide timing,
 * transition, overlay and focal point; optional schedule window. Literal table name so the
 * drift tooling can attribute the columns (see the CLAUDE.md gotcha).
 */
export class HeroSlides1940000000000 implements MigrationInterface {
  name = "HeroSlides1940000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hero_slides" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "image_key" varchar(512) NOT NULL,
        "image_url" varchar(1024) NOT NULL,
        "alt_en" varchar(255),
        "alt_es" varchar(255),
        "headline_en" varchar(200),
        "headline_es" varchar(200),
        "subheadline_en" varchar(400),
        "subheadline_es" varchar(400),
        "cta_label_en" varchar(80),
        "cta_label_es" varchar(80),
        "cta_url" varchar(1024),
        "position" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "duration_ms" integer,
        "transition" varchar(20) NOT NULL DEFAULT 'fade',
        "overlay_opacity" real NOT NULL DEFAULT 0.4,
        "focal_x" integer NOT NULL DEFAULT 50,
        "focal_y" integer NOT NULL DEFAULT 50,
        "starts_at" timestamptz,
        "ends_at" timestamptz,
        "updated_by" uuid,
        CONSTRAINT "PK_hero_slides" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_hero_slides_active_position" ON "hero_slides" ("is_active", "position")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_hero_slides_active_position"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hero_slides"`);
  }
}
