import { Column, Entity, Index, Unique } from "typeorm";
import { AppBaseEntity } from "./base.entity";

/**
 * Which agents are responsible for which customers.
 *
 * Scope §8 says an agent sees "assigned customers", and until now no assignment
 * concept existed anywhere in the codebase — which is why `assertCanReadDocument`
 * lets any staff member read any customer's documents. This table is the data that
 * gap needs; narrowing the read helper against it is a separate, reviewed change.
 *
 * **Many-to-many on purpose.** A customer may have several agents and an agent many
 * customers. Client decision C6 ("can one customer be assigned to multiple
 * agents?") is still unanswered, and narrowing a unique constraint later is a
 * simpler migration than widening one once real rows exist. A one-agent-per-
 * customer policy can be enforced on top of this schema without changing it.
 *
 * No `UserEntity` relation properties are declared, deliberately. The rule in
 * `docs/decision-log.md` (2026-10-11) is that no response may embed a raw
 * `UserEntity`, because it carries `passwordHash` and `tokensValidFrom`. Without a
 * relation to load, that mistake is not available here. The foreign keys are real —
 * they are declared in the migration — so referential integrity does not depend on
 * the decorators.
 */
@Entity({ name: "agent_customer_assignments" })
@Unique(["agentId", "customerId"])
export class AgentCustomerAssignmentEntity extends AppBaseEntity {
  /** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
  @Column({ name: "is_demo", type: "boolean", default: false })
  isDemo!: boolean;

  @Column({ name: "agent_id", type: "uuid" })
  @Index()
  agentId!: string;

  @Column({ name: "customer_id", type: "uuid" })
  @Index()
  customerId!: string;

  /**
   * Who made the assignment. Nullable and `ON DELETE SET NULL`: when a manager
   * leaves, their assignments must survive them.
   */
  @Column({ name: "assigned_by", type: "uuid", nullable: true })
  assignedBy?: string | null;

  @Column({ type: "text", nullable: true })
  note?: string | null;
}
