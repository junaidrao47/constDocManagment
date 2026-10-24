import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";

/**
 * A customer's onboarding profile (PROJECT-BRIEF §11.4).
 *
 * One row per customer (`customer_id` is unique). The `notification_emails` array
 * is the address list phase emails are sent to — distinct from the login email on
 * `users`. Arrays are `jsonb` rather than a Postgres text[] to keep TypeORM's
 * mapping simple and predictable.
 *
 * No `UserEntity` relation is declared, deliberately: the same rule as the agent
 * assignment table (a response must never embed a row carrying `passwordHash`).
 */
@Entity({ name: "customer_profiles" })
export class CustomerProfileEntity extends AppBaseEntity {
  @Column({ name: "customer_id", type: "uuid" })
  @Index({ unique: true })
  customerId!: string;

  @Column({ type: "varchar", length: 40, nullable: true })
  persona?: string | null;

  @Column({ name: "legal_name", type: "varchar", length: 200, nullable: true })
  legalName?: string | null;

  @Column({ name: "contact_name", type: "varchar", length: 200, nullable: true })
  contactName?: string | null;

  /** Up to 3 validated addresses; the recipients for phase emails. */
  @Column({ name: "notification_emails", type: "jsonb", default: () => "'[]'" })
  notificationEmails!: string[];

  @Column({ type: "varchar", length: 30, nullable: true })
  phone?: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  state?: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  city?: string | null;

  /** Service/package ids the customer says they need (free-form until tied to the catalog). */
  @Column({ type: "jsonb", default: () => "'[]'" })
  needs!: string[];

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt?: Date | null;
}
