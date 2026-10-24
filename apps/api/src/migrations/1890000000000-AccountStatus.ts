import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Account approval lifecycle + preferred locale on users (PROJECT-BRIEF §11.1/§11.4).
 *
 * Designed to run on a populated `users` table. The sequence keeps every existing
 * row valid at all times:
 *   1. create the two enum types (guarded so a re-run is a no-op).
 *   2. add both columns NULLABLE.
 *   3. backfill: every existing account is `approved`; locale defaults to es-MX.
 *   4. SET NOT NULL + SET DEFAULT once the data satisfies the constraint.
 *
 * The DB default for `account_status` is `approved` so staff/admin inserts and any
 * future row are usable without naming it; the register service overrides it to
 * `pending_approval` for self-registered customers.
 */
export class AccountStatus1890000000000 implements MigrationInterface {
  name = "AccountStatus1890000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "account_status_enum" AS ENUM ('pending_approval', 'approved', 'suspended');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_locale_enum" AS ENUM ('en', 'es-MX');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "account_status" "account_status_enum",
        ADD COLUMN IF NOT EXISTS "preferred_locale" "user_locale_enum"
    `);

    await queryRunner.query(`UPDATE "users" SET "account_status" = 'approved' WHERE "account_status" IS NULL`);
    await queryRunner.query(`UPDATE "users" SET "preferred_locale" = 'es-MX' WHERE "preferred_locale" IS NULL`);

    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "account_status" SET NOT NULL,
        ALTER COLUMN "account_status" SET DEFAULT 'approved',
        ALTER COLUMN "preferred_locale" SET NOT NULL,
        ALTER COLUMN "preferred_locale" SET DEFAULT 'es-MX'
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_account_status" ON "users" ("account_status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_account_status"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "account_status",
        DROP COLUMN IF EXISTS "preferred_locale"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "account_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_locale_enum"`);
  }
}
