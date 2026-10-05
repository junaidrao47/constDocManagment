import { MigrationInterface, QueryRunner } from "typeorm";

export class PricingGuardrails1780000000000 implements MigrationInterface {
  name = "PricingGuardrails1780000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "industries"
        ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "price_weight" decimal(8,4) NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_industries_is_active"
      ON "industries" ("is_active")
    `);

    await queryRunner.query(`
      ALTER TABLE "quotations"
        ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'MXN'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key" varchar(100) NOT NULL,
        "value" jsonb NOT NULL,
        "updated_by" uuid NULL,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_settings_key" PRIMARY KEY ("key")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "app_settings"
        DROP CONSTRAINT IF EXISTS "FK_app_settings_updated_by",
        ADD CONSTRAINT "FK_app_settings_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      INSERT INTO "app_settings" ("key", "value") VALUES
        ('currency', '"MXN"'::jsonb),
        ('quote_validity_days', '15'::jsonb)
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app_settings"
        DROP CONSTRAINT IF EXISTS "FK_app_settings_updated_by"
    `);

    await queryRunner.query(`
      DELETE FROM "app_settings"
      WHERE "key" IN ('currency', 'quote_validity_days')
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_industries_is_active"`);
    await queryRunner.query(`ALTER TABLE "quotations" DROP COLUMN IF EXISTS "currency"`);
    await queryRunner.query(`ALTER TABLE "industries" DROP COLUMN IF EXISTS "price_weight"`);
    await queryRunner.query(`ALTER TABLE "industries" DROP COLUMN IF EXISTS "is_active"`);
  }
}
