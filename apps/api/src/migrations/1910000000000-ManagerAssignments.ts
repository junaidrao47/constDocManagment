import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Manager-to-customer assignment + its reassignment log (PROJECT-BRIEF §11.2).
 *
 * Two genuinely new tables, so `CREATE TABLE IF NOT EXISTS` is correct. The agent
 * assignment table (1850000000000) is left untouched: a manager is a different
 * role and the cardinality differs — one manager per customer, enforced by the
 * unique index on `customer_id`. The log is append-only so a reassignment never
 * overwrites the previous record.
 *
 * FKs: customer and manager cascade (deleting the user removes their rows);
 * `assigned_by` / `changed_by` set null, because the record outlives the admin.
 */
export class ManagerAssignments1910000000000 implements MigrationInterface {
  name = "ManagerAssignments1910000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_manager_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "customer_id" uuid NOT NULL,
        "manager_id" uuid NOT NULL,
        "assigned_by" uuid NULL,
        "note" text,
        CONSTRAINT "PK_customer_manager_assignments_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_manager_assignments"
        DROP CONSTRAINT IF EXISTS "FK_customer_manager_assignments_customer",
        ADD CONSTRAINT "FK_customer_manager_assignments_customer"
          FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_customer_manager_assignments_manager",
        ADD CONSTRAINT "FK_customer_manager_assignments_manager"
          FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_customer_manager_assignments_assigned_by",
        ADD CONSTRAINT "FK_customer_manager_assignments_assigned_by"
          FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_manager_assignments_customer"
      ON "customer_manager_assignments" ("customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_manager_assignments_manager_id"
      ON "customer_manager_assignments" ("manager_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_manager_assignment_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "customer_id" uuid NOT NULL,
        "from_manager_id" uuid NULL,
        "to_manager_id" uuid NOT NULL,
        "changed_by" uuid NULL,
        "reason" text,
        CONSTRAINT "PK_customer_manager_assignment_log_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_manager_assignment_log"
        DROP CONSTRAINT IF EXISTS "FK_customer_manager_assignment_log_customer",
        ADD CONSTRAINT "FK_customer_manager_assignment_log_customer"
          FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_customer_manager_assignment_log_to_manager",
        ADD CONSTRAINT "FK_customer_manager_assignment_log_to_manager"
          FOREIGN KEY ("to_manager_id") REFERENCES "users"("id") ON DELETE CASCADE,
        DROP CONSTRAINT IF EXISTS "FK_customer_manager_assignment_log_from_manager",
        ADD CONSTRAINT "FK_customer_manager_assignment_log_from_manager"
          FOREIGN KEY ("from_manager_id") REFERENCES "users"("id") ON DELETE SET NULL,
        DROP CONSTRAINT IF EXISTS "FK_customer_manager_assignment_log_changed_by",
        ADD CONSTRAINT "FK_customer_manager_assignment_log_changed_by"
          FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_manager_assignment_log_customer_id"
      ON "customer_manager_assignment_log" ("customer_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_manager_assignment_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_manager_assignments"`);
  }
}
