import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Gives `packages` the fields a public packages page needs.
 *
 * `publicService.listPackages()` passed no `where` clause, because there was
 * nothing to filter on: every package was public the moment it was created, with
 * no way to retire one or to draft the next. `is_active` closes that; the other
 * three are what the page needs to present a package rather than just name it.
 *
 * Explicit `ALTER TABLE`, not `CREATE TABLE IF NOT EXISTS`: the latter is a no-op
 * on an already-migrated database and cannot add a column to a table InitialSchema
 * created. That mistake is recorded in docs/decision-log.md for 2026-10-12.
 *
 * Existing rows default to active with sort_order 0, so nothing that is public
 * today disappears when this runs.
 */
export class PackageVisibility1840000000000 implements MigrationInterface {
  name = "PackageVisibility1840000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "packages"
        ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "description" text,
        ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_packages_is_active"
      ON "packages" ("is_active")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packages_is_active"`);
    await queryRunner.query(`
      ALTER TABLE "packages"
        DROP COLUMN IF EXISTS "is_featured",
        DROP COLUMN IF EXISTS "sort_order",
        DROP COLUMN IF EXISTS "description",
        DROP COLUMN IF EXISTS "is_active"
    `);
  }
}
