import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Three columns in Postgres disagreed with their entities, and the Jest suite
 * runs against an in-memory fake DB, so none of it was visible to `npm test`.
 * Same defect class as `1820000000000-DocumentApprovedUpload`.
 *
 * 1. `quotation_items.service_id` was `NOT NULL` (InitialSchema) while
 *    `QuotationItemEntity` declares `nullable: true`. Staff quotations insert
 *    `serviceId: null` for their `worker_base`, `gov_fee` and `discount` lines
 *    (quotation.service.ts), so every staff-created quotation failed.
 * 2. `payments.status` was `NOT NULL` with no default, but `PaymentEntity` has
 *    no `status` property and nothing writes one, so every payment insert
 *    failed. The column is dropped rather than defaulted: no code maintains it,
 *    and payment state is derived from the invoice.
 * 3. `payments.gateway_ref` is a legacy column on no entity, already backfilled
 *    into `reference` by `1810000000000-InvoicePayments`. Dropped.
 *
 * Also gives `subscriptions.status` the default the entity implies.
 */
export class FixSchemaDrift1830000000000 implements MigrationInterface {
  name = "FixSchemaDrift1830000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotation_items" ALTER COLUMN "service_id" DROP NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "gateway_ref"
    `);

    await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'active'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP DEFAULT`);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "gateway_ref" character varying(255),
        ADD COLUMN IF NOT EXISTS "status" character varying(50)
    `);
    // Restoring NOT NULL would fail on rows written while the column was gone,
    // so backfill the recorded payments first rather than deleting any data.
    await queryRunner.query(`UPDATE "payments" SET "status" = 'confirmed' WHERE "status" IS NULL`);
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET NOT NULL`);

    // Fails by design if any null-service line items exist: they are real data
    // from staff quotations and must be reviewed, never silently removed.
    await queryRunner.query(`ALTER TABLE "quotation_items" ALTER COLUMN "service_id" SET NOT NULL`);
  }
}
