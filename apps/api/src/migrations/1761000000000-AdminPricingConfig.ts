import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminPricingConfig1761000000000 implements MigrationInterface {
  name = "AdminPricingConfig1761000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Add is_active to industries if it does not exist
    await queryRunner.query(`
      ALTER TABLE "industries"
        ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);

    // Add price_weight to industries if it does not exist
    await queryRunner.query(`
      ALTER TABLE "industries"
        ADD COLUMN IF NOT EXISTS "price_weight" decimal(8,4) NOT NULL DEFAULT 1
    `);

    // Create app_settings table (safe to re-run)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key"        varchar(100) NOT NULL,
        "value"      jsonb        NOT NULL,
        "updated_by" uuid         NULL,
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_settings_key" PRIMARY KEY ("key")
      )
    `);

    // Insert defaults — ON CONFLICT keeps re-runs idempotent
    await queryRunner.query(`
      INSERT INTO "app_settings" ("key", "value") VALUES
        ('currency',            '"MXN"'::jsonb),
        ('quote_validity_days', '15'::jsonb)
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "app_settings" WHERE "key" IN ('currency', 'quote_validity_days')`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings"`);
    await queryRunner.query(
      `ALTER TABLE "industries" DROP COLUMN IF EXISTS "price_weight"`,
    );
    await queryRunner.query(
      `ALTER TABLE "industries" DROP COLUMN IF EXISTS "is_active"`,
    );
  }
}
