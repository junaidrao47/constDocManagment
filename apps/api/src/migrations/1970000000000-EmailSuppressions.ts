import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Email suppression list: one row per address that must not be mailed, populated from
 * SES bounce/complaint SNS events (and, later, manual entries). The worker checks this
 * table before every send. Literal table name so the drift tooling can attribute the
 * columns (see the CLAUDE.md gotcha).
 */
export class EmailSuppressions1970000000000 implements MigrationInterface {
  name = "EmailSuppressions1970000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_suppressions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "email" varchar(320) NOT NULL,
        "reason" varchar(20) NOT NULL,
        "detail" text,
        CONSTRAINT "PK_email_suppressions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_email_suppressions_email" ON "email_suppressions" ("email")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_email_suppressions_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_suppressions"`);
  }
}
