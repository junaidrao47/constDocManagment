import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Document approval phases, their history, and a whole-document target date
 * (PROJECT-BRIEF §11.5).
 *
 * `documents.target_date` is a new NULLABLE column added with an explicit ALTER on
 * the literal table name (so the drift tooling matches it). The two new tables use
 * `CREATE TABLE IF NOT EXISTS` because they are genuinely new.
 *
 * Phase `status` is a plain varchar, not a Postgres enum: §10.3 says statuses will
 * change, and a varchar avoids an enum ALTER later. `position` is a non-unique
 * index so a reorder can swap values within one transaction. No change is needed
 * for `document_versions.kind` — it is already a varchar, so the new `phase_result`
 * value needs no migration.
 */
export class DocumentPhases1920000000000 implements MigrationInterface {
  name = "DocumentPhases1920000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "target_date" timestamptz`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_phases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "document_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "name_en" varchar(150) NOT NULL,
        "name_es" varchar(150) NOT NULL,
        "department" varchar(150),
        "target_date" timestamptz,
        "status" varchar(20) NOT NULL DEFAULT 'not_started',
        "completed_at" timestamptz,
        "completed_by" uuid,
        "note" text,
        "result_version_id" uuid,
        CONSTRAINT "PK_document_phases_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "document_phases"
        DROP CONSTRAINT IF EXISTS "FK_document_phases_document",
        ADD CONSTRAINT "FK_document_phases_document"
          FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_document_phases_completed_by",
        ADD CONSTRAINT "FK_document_phases_completed_by"
          FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL,
        DROP CONSTRAINT IF EXISTS "FK_document_phases_result_version",
        ADD CONSTRAINT "FK_document_phases_result_version"
          FOREIGN KEY ("result_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_phases_document_position"
      ON "document_phases" ("document_id", "position")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_phase_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "phase_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "from_status" varchar(20),
        "to_status" varchar(20) NOT NULL,
        "note" text,
        "changed_by" uuid NULL,
        CONSTRAINT "PK_document_phase_history_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "document_phase_history"
        DROP CONSTRAINT IF EXISTS "FK_document_phase_history_phase",
        ADD CONSTRAINT "FK_document_phase_history_phase"
          FOREIGN KEY ("phase_id") REFERENCES "document_phases"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_document_phase_history_changed_by",
        ADD CONSTRAINT "FK_document_phase_history_changed_by"
          FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_phase_history_phase_id"
      ON "document_phase_history" ("phase_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_document_phase_history_document_id"
      ON "document_phase_history" ("document_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "document_phase_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_phases"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "target_date"`);
  }
}
