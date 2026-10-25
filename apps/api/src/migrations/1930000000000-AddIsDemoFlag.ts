import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `is_demo` flag for one-command demo data purge (W1).
 *
 * Added to the demo "root" tables the seed creates directly. Dependent/child rows
 * (document_versions, document_phases, *_history, quotation_items, customer_profiles,
 * service_required_documents, refresh_tokens, notifications_log, the package_services join)
 * carry no flag — they are purged through their parent's FK by scripts/purge-demo.ts.
 *
 * `boolean NOT NULL DEFAULT false` so every existing row is non-demo and inserts that omit it
 * still work. Literal table names per the CLAUDE.md drift-tooling gotcha (no interpolated loop).
 * Each column is on the matching entity (UserEntity, CategoryEntity, ServiceEntity, PackageEntity,
 * DocumentEntity, QuotationEntity, InvoiceEntity, PaymentEntity, SubscriptionEntity, and the two
 * assignment entities) — add the column here and on the entity together or selects/inserts drift.
 */
export class AddIsDemoFlag1930000000000 implements MigrationInterface {
  name = "AddIsDemoFlag1930000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "agent_customer_assignments" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "customer_manager_assignments" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "packages" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "quotations" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "agent_customer_assignments" DROP COLUMN IF EXISTS "is_demo"`);
    await queryRunner.query(`ALTER TABLE "customer_manager_assignments" DROP COLUMN IF EXISTS "is_demo"`);
  }
}
