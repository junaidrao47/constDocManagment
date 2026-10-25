import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "./base.entity";

/**
 * The customer's currently assigned manager (PROJECT-BRIEF §11.2).
 *
 * One manager per customer at a time, enforced by the unique index on
 * `customer_id`. This is the live state; reassignments are recorded separately in
 * `customer_manager_assignment_log` so history is never overwritten.
 *
 * No `UserEntity` relations, for the same reason as the agent assignment table:
 * a response must never embed a row carrying `passwordHash`. The foreign keys are
 * declared in the migration, so referential integrity does not depend on decorators.
 */
@Entity({ name: "customer_manager_assignments" })
export class CustomerManagerAssignmentEntity extends AppBaseEntity {
  /** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
  @Column({ name: "is_demo", type: "boolean", default: false })
  isDemo!: boolean;

  @Column({ name: "customer_id", type: "uuid" })
  @Index({ unique: true })
  customerId!: string;

  @Column({ name: "manager_id", type: "uuid" })
  @Index()
  managerId!: string;

  /** Who made the assignment. Nullable + `ON DELETE SET NULL`: it outlives that admin. */
  @Column({ name: "assigned_by", type: "uuid", nullable: true })
  assignedBy?: string | null;

  @Column({ type: "text", nullable: true })
  note?: string | null;
}
