import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The agent-to-customer assignment table.
 *
 * `CREATE TABLE IF NOT EXISTS` is safe here because the table is genuinely new.
 * The no-op warning in docs/decision-log.md (2026-10-12) is about using it to
 * *correct* a table an earlier migration created, which is not what this is.
 *
 * Unique on (agent_id, customer_id): many-to-many, per the reasoning on the
 * entity. Both user references cascade, so deleting a user removes their
 * assignments rather than leaving dangling rows; `assigned_by` sets null instead,
 * because the assignment outlives the manager who made it.
 */
export class AgentCustomerAssignments1850000000000 implements MigrationInterface {
  name = "AgentCustomerAssignments1850000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_customer_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "agent_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "assigned_by" uuid NULL,
        "note" text,
        CONSTRAINT "PK_agent_customer_assignments_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_customer_assignments"
        DROP CONSTRAINT IF EXISTS "FK_agent_customer_assignments_agent",
        ADD CONSTRAINT "FK_agent_customer_assignments_agent"
          FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_agent_customer_assignments_customer",
        ADD CONSTRAINT "FK_agent_customer_assignments_customer"
          FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_agent_customer_assignments_assigned_by",
        ADD CONSTRAINT "FK_agent_customer_assignments_assigned_by"
          FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_agent_customer_assignments_pair"
      ON "agent_customer_assignments" ("agent_id", "customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_customer_assignments_agent_id"
      ON "agent_customer_assignments" ("agent_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_customer_assignments_customer_id"
      ON "agent_customer_assignments" ("customer_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_customer_assignments"`);
  }
}
