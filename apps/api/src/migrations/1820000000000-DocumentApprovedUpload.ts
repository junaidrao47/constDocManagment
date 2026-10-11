import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `DocumentEntity` declares the approved-upload columns (`approvedFileName`,
 * `approvedS3Key`, `approvedUploadedBy`, `approvedUploadedAt`) but no migration
 * ever created them, so any query selecting a document failed with
 * `column DocumentEntity.approved_file_name does not exist`. This adds them.
 */
export class DocumentApprovedUpload1820000000000 implements MigrationInterface {
  name = "DocumentApprovedUpload1820000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD COLUMN IF NOT EXISTS "approved_file_name" character varying(255),
        ADD COLUMN IF NOT EXISTS "approved_s3_key" character varying(512),
        ADD COLUMN IF NOT EXISTS "approved_uploaded_by" uuid,
        ADD COLUMN IF NOT EXISTS "approved_uploaded_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP CONSTRAINT IF EXISTS "FK_documents_approved_uploaded_by",
        ADD CONSTRAINT "FK_documents_approved_uploaded_by" FOREIGN KEY ("approved_uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP CONSTRAINT IF EXISTS "FK_documents_approved_uploaded_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP COLUMN IF EXISTS "approved_uploaded_at",
        DROP COLUMN IF EXISTS "approved_uploaded_by",
        DROP COLUMN IF EXISTS "approved_s3_key",
        DROP COLUMN IF EXISTS "approved_file_name"
    `);
  }
}
