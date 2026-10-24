import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-package marketing image (public card media).
 *
 * `packages.image_url` is the path/URL the public site renders; `packages.image_key` is the
 * storage key kept so a replaced image's object can be deleted. Both nullable — an existing
 * package keeps showing its category image until an admin uploads one.
 *
 * Literal table name (no interpolation) so the drift tooling can attribute the columns —
 * see the CLAUDE.md gotcha. There is no new table for contact inquiries: the contact form
 * reuses the existing `app_settings` row (`contact_recipient_email`) and the email queue,
 * so no schema change is needed for it.
 */
export class PackageImage1880000000000 implements MigrationInterface {
  name = "PackageImage1880000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "packages"
        ADD COLUMN IF NOT EXISTS "image_url" varchar(1024),
        ADD COLUMN IF NOT EXISTS "image_key" varchar(512)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "packages"
        DROP COLUMN IF EXISTS "image_url",
        DROP COLUMN IF EXISTS "image_key"
    `);
  }
}
