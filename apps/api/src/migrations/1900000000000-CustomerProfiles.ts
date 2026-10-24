import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Customer onboarding profiles (PROJECT-BRIEF §11.4).
 *
 * A genuinely new table, so `CREATE TABLE IF NOT EXISTS` is correct here (the no-op
 * warning in the decision log is about *correcting* a table an earlier migration
 * created). One row per customer: the unique index on `customer_id` enforces it.
 * Arrays are jsonb to keep the TypeORM mapping simple.
 */
export class CustomerProfiles1900000000000 implements MigrationInterface {
  name = "CustomerProfiles1900000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "customer_id" uuid NOT NULL,
        "persona" varchar(40),
        "legal_name" varchar(200),
        "contact_name" varchar(200),
        "notification_emails" jsonb NOT NULL DEFAULT '[]',
        "phone" varchar(30),
        "state" varchar(120),
        "city" varchar(120),
        "needs" jsonb NOT NULL DEFAULT '[]',
        "completed_at" timestamptz,
        CONSTRAINT "PK_customer_profiles_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_profiles_customer"
      ON "customer_profiles" ("customer_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_profiles"
        DROP CONSTRAINT IF EXISTS "FK_customer_profiles_customer",
        ADD CONSTRAINT "FK_customer_profiles_customer"
          FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_profiles"`);
  }
}
