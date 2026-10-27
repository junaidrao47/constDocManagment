import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-service marketing image and structured public-detail content.
 *
 * `services.image_url` / `services.image_key` mirror the package-image columns: the URL the
 * public card and detail page render, and the storage key kept so a replaced object can be
 * deleted. Both nullable — a service with no image falls back to its category image.
 *
 * `whats_included_*` and `process_steps_*` carry the bilingual "what you get / how it works
 * after you buy" content shown on the public service detail page. JSONB defaulting to an
 * empty array so every existing row is immediately valid with no backfill.
 *
 * Literal table name (no interpolation) so the drift tooling can attribute the columns.
 */
export class ServiceImageAndDetails1960000000000 implements MigrationInterface {
  name = "ServiceImageAndDetails1960000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "services"
        ADD COLUMN IF NOT EXISTS "image_url" varchar(1024),
        ADD COLUMN IF NOT EXISTS "image_key" varchar(512),
        ADD COLUMN IF NOT EXISTS "whats_included_en" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS "whats_included_es" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS "process_steps_en" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS "process_steps_es" jsonb NOT NULL DEFAULT '[]'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "services"
        DROP COLUMN IF EXISTS "image_url",
        DROP COLUMN IF EXISTS "image_key",
        DROP COLUMN IF EXISTS "whats_included_en",
        DROP COLUMN IF EXISTS "whats_included_es",
        DROP COLUMN IF EXISTS "process_steps_en",
        DROP COLUMN IF EXISTS "process_steps_es"
    `);
  }
}
