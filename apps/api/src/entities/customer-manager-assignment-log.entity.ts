import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "./base.entity";

/**
 * Append-only record of manager (re)assignments (PROJECT-BRIEF §11.2:
 * "reassignment is logged"). One row per change, including the first assignment
 * (`from_manager_id` null). Never updated or deleted.
 */
@Entity({ name: "customer_manager_assignment_log" })
export class CustomerManagerAssignmentLogEntity extends AppBaseEntity {
  @Column({ name: "customer_id", type: "uuid" })
  @Index()
  customerId!: string;

  @Column({ name: "from_manager_id", type: "uuid", nullable: true })
  fromManagerId?: string | null;

  @Column({ name: "to_manager_id", type: "uuid" })
  toManagerId!: string;

  @Column({ name: "changed_by", type: "uuid", nullable: true })
  changedBy?: string | null;

  @Column({ type: "text", nullable: true })
  reason?: string | null;
}
