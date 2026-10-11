import { MigrationInterface, QueryRunner } from "typeorm";

export class QuotationLineItems1790000000000 implements MigrationInterface {
  name = "QuotationLineItems1790000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quotation_items"
        ADD COLUMN IF NOT EXISTS "kind" character varying(50) NOT NULL DEFAULT 'service',
        ADD COLUMN IF NOT EXISTS "quantity" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "unit_price" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "line_total" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quotation_items"
        DROP COLUMN IF EXISTS "line_total",
        DROP COLUMN IF EXISTS "unit_price",
        DROP COLUMN IF EXISTS "quantity",
        DROP COLUMN IF EXISTS "kind"
    `);
  }
}
