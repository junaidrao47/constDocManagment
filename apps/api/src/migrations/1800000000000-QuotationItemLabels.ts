import { MigrationInterface, QueryRunner } from "typeorm";

export class QuotationItemLabels1800000000000 implements MigrationInterface {
  name = "QuotationItemLabels1800000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quotation_items"
      ADD COLUMN IF NOT EXISTS "label" varchar(200)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quotation_items"
      DROP COLUMN IF EXISTS "label"
    `);
  }
}
