import { MigrationInterface, QueryRunner } from "typeorm";

export class QuotationWorkflow1758000000000 implements MigrationInterface {
  name = "QuotationWorkflow1758000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "rejection_reason" text`);
    await queryRunner.query(`ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "quotation_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "quotation_id" uuid NOT NULL, "from_status" character varying(50), "to_status" character varying(50) NOT NULL, "changed_by" uuid, "note" text, CONSTRAINT "PK_quotation_status_history_id" PRIMARY KEY ("id"), CONSTRAINT "FK_quotation_status_history_quotation" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_quotation_status_history_quotation_id" ON "quotation_status_history" ("quotation_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "quotation_status_history"`);
    await queryRunner.query(`ALTER TABLE "quotations" DROP COLUMN IF EXISTS "accepted_at", DROP COLUMN IF EXISTS "sent_at", DROP COLUMN IF EXISTS "rejection_reason"`);
  }
}