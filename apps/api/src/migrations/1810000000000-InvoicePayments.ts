import { MigrationInterface, QueryRunner } from "typeorm";

export class InvoicePayments1810000000000 implements MigrationInterface {
  name = "InvoicePayments1810000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN IF NOT EXISTS "quotation_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "invoice_number" varchar(20),
        ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'MXN',
        ADD COLUMN IF NOT EXISTS "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "tax_amount" numeric(12,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`UPDATE "invoices" SET "subtotal" = "amount" WHERE "subtotal" = 0 AND "amount" <> 0`);
    await queryRunner.query(`
      WITH numbered AS (
        SELECT "id", "created_at",
          row_number() OVER (
            PARTITION BY date_part('year', "created_at")
            ORDER BY "created_at", "id"
          ) AS sequence_number
        FROM "invoices"
        WHERE "invoice_number" IS NULL
      )
      UPDATE "invoices" AS invoice
      SET "invoice_number" = 'INV-' || to_char(numbered."created_at", 'YYYY') || '-' || lpad(numbered.sequence_number::text, 4, '0')
      FROM numbered
      WHERE invoice."id" = numbered."id"
    `);
    await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "invoice_number" SET NOT NULL`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invoices_invoice_number"
      ON "invoices" ("invoice_number")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invoices_quotation_id"
      ON "invoices" ("quotation_id")
      WHERE "quotation_id" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "invoices"
        DROP CONSTRAINT IF EXISTS "FK_invoices_quotation",
        ADD CONSTRAINT "FK_invoices_quotation" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoice_number_counters" (
        "year" integer NOT NULL,
        "last_number" integer NOT NULL,
        CONSTRAINT "PK_invoice_number_counters" PRIMARY KEY ("year")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "invoice_number_counters" ("year", "last_number")
      SELECT substring("invoice_number" from 5 for 4)::integer,
             max(substring("invoice_number" from 10)::integer)
      FROM "invoices"
      GROUP BY substring("invoice_number" from 5 for 4)
      ON CONFLICT ("year") DO UPDATE
      SET "last_number" = GREATEST("invoice_number_counters"."last_number", EXCLUDED."last_number")
    `);
    await queryRunner.query(`
      INSERT INTO "app_settings" ("key", "value")
      VALUES ('payment_terms_days', '15'::jsonb)
      ON CONFLICT ("key") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoice_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "method" varchar(30) NOT NULL,
        "reference" varchar(255),
        "paid_at" timestamptz NOT NULL DEFAULT now(),
        "recorded_by" uuid,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_payments_method" CHECK ("method" IN ('bank_transfer', 'spei', 'cash', 'other')),
        CONSTRAINT "CHK_payments_amount_positive" CHECK ("amount" > 0)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "method" varchar(30) NOT NULL DEFAULT 'other',
        ADD COLUMN IF NOT EXISTS "reference" varchar(255),
        ADD COLUMN IF NOT EXISTS "recorded_by" uuid NULL,
        ADD COLUMN IF NOT EXISTS "note" text,
        ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payments' AND column_name = 'gateway_ref'
        ) THEN
          UPDATE "payments" SET "reference" = "gateway_ref"
          WHERE "reference" IS NULL AND "gateway_ref" IS NOT NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP CONSTRAINT IF EXISTS "CHK_payments_method",
        ADD CONSTRAINT "CHK_payments_method" CHECK ("method" IN ('bank_transfer', 'spei', 'cash', 'other')),
        DROP CONSTRAINT IF EXISTS "CHK_payments_amount_positive",
        ADD CONSTRAINT "CHK_payments_amount_positive" CHECK ("amount" > 0),
        DROP CONSTRAINT IF EXISTS "FK_payments_invoice",
        ADD CONSTRAINT "FK_payments_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_payments_recorded_by",
        ADD CONSTRAINT "FK_payments_recorded_by" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payments_invoice_id" ON "payments" ("invoice_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "app_settings" WHERE "key" = 'payment_terms_days'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_invoice_id"`);
    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP CONSTRAINT IF EXISTS "FK_payments_recorded_by",
        DROP CONSTRAINT IF EXISTS "FK_payments_invoice",
        DROP CONSTRAINT IF EXISTS "CHK_payments_amount_positive",
        DROP CONSTRAINT IF EXISTS "CHK_payments_method",
        DROP COLUMN IF EXISTS "note",
        DROP COLUMN IF EXISTS "recorded_by",
        DROP COLUMN IF EXISTS "reference",
        DROP COLUMN IF EXISTS "method"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_number_counters"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_invoices_quotation_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_invoices_invoice_number"`);
    await queryRunner.query(`
      ALTER TABLE "invoices"
        DROP CONSTRAINT IF EXISTS "FK_invoices_quotation",
        DROP COLUMN IF EXISTS "tax_amount",
        DROP COLUMN IF EXISTS "subtotal",
        DROP COLUMN IF EXISTS "currency",
        DROP COLUMN IF EXISTS "invoice_number",
        DROP COLUMN IF EXISTS "quotation_id"
    `);
  }
}
