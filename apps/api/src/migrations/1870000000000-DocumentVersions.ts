import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Document versions, the required-documents checklist, and the new
 * `submitted_to_government` status (PROJECT-BRIEF §7.5; audit 2026-10-19 R56–R61).
 *
 * Runs on a database that already has documents: every existing document gets a
 * backfilled `document_versions` row for its current file (and one for its approved
 * file, if any), and `documents.current_version_id` is pointed at the customer one.
 *
 * Literal per-table SQL (no interpolated table names) so the drift tooling can
 * attribute every column — see the CLAUDE.md gotcha.
 *
 * `ALTER TYPE ... ADD VALUE` is safe inside the migration transaction on PG16
 * because the new value is not *used* in the same migration (no row is written with
 * it here). Postgres cannot drop an enum value, so `down()` leaves it in place.
 */
export class DocumentVersions1870000000000 implements MigrationInterface {
  name = "DocumentVersions1870000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. new status value
    await queryRunner.query(`ALTER TYPE "document_status_enum" ADD VALUE IF NOT EXISTS 'submitted_to_government'`);

    // 2. document_versions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "document_id" uuid NOT NULL,
        "version_no" integer NOT NULL,
        "kind" varchar(30) NOT NULL,
        "storage_key" varchar(512) NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "mime_type" varchar(200),
        "size_bytes" bigint,
        "uploaded_by" uuid,
        "uploaded_by_role" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'intent',
        "intent_expires_at" timestamptz,
        CONSTRAINT "PK_document_versions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "document_versions"
        DROP CONSTRAINT IF EXISTS "FK_document_versions_document",
        ADD CONSTRAINT "FK_document_versions_document"
          FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_document_versions_document_id" ON "document_versions" ("document_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_document_versions_doc_version" ON "document_versions" ("document_id", "version_no")`);

    // 3. service_required_documents
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_required_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "service_id" uuid NOT NULL,
        "name_en" varchar(150) NOT NULL,
        "name_es" varchar(150) NOT NULL,
        "description_en" text,
        "description_es" text,
        "is_required" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "allowed_mime_types" jsonb,
        CONSTRAINT "PK_service_required_documents_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "service_required_documents"
        DROP CONSTRAINT IF EXISTS "FK_service_required_documents_service",
        ADD CONSTRAINT "FK_service_required_documents_service"
          FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_service_required_documents_service_id" ON "service_required_documents" ("service_id")`);

    // 4. documents.current_version_id + requirement_id
    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD COLUMN IF NOT EXISTS "current_version_id" uuid,
        ADD COLUMN IF NOT EXISTS "requirement_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP CONSTRAINT IF EXISTS "FK_documents_current_version",
        ADD CONSTRAINT "FK_documents_current_version"
          FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL,
        DROP CONSTRAINT IF EXISTS "FK_documents_requirement",
        ADD CONSTRAINT "FK_documents_requirement"
          FOREIGN KEY ("requirement_id") REFERENCES "service_required_documents"("id") ON DELETE SET NULL
    `);

    // 5. backfill: a customer version for every existing document, then point
    //    current_version_id at it; an official version where an approved file exists.
    await queryRunner.query(`
      INSERT INTO "document_versions"
        ("document_id", "version_no", "kind", "storage_key", "file_name", "mime_type", "size_bytes", "uploaded_by", "uploaded_by_role", "status")
      SELECT d."id", 1, 'customer', d."s3_key", d."file_name", 'application/octet-stream', NULL, d."customer_id", 'customer', 'ready'
      FROM "documents" d
      WHERE d."s3_key" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "document_versions" v WHERE v."document_id" = d."id" AND v."kind" = 'customer')
    `);
    await queryRunner.query(`
      UPDATE "documents" d
      SET "current_version_id" = v."id"
      FROM "document_versions" v
      WHERE v."document_id" = d."id" AND v."kind" = 'customer' AND v."version_no" = 1
        AND d."current_version_id" IS NULL
    `);
    await queryRunner.query(`
      INSERT INTO "document_versions"
        ("document_id", "version_no", "kind", "storage_key", "file_name", "mime_type", "size_bytes", "uploaded_by", "uploaded_by_role", "status")
      SELECT d."id", 2, 'official', d."approved_s3_key", COALESCE(d."approved_file_name", 'official'), 'application/octet-stream', NULL, d."approved_uploaded_by", 'admin', 'ready'
      FROM "documents" d
      WHERE d."approved_s3_key" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "document_versions" v WHERE v."document_id" = d."id" AND v."kind" = 'official')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_current_version"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_requirement"`);
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP COLUMN IF EXISTS "current_version_id",
        DROP COLUMN IF EXISTS "requirement_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_required_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_versions"`);
    // The 'submitted_to_government' enum value is intentionally left in place:
    // Postgres cannot remove an enum value.
  }
}
