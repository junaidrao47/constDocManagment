import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "./base.entity";

/**
 * Addresses that must not receive mail. Populated from SES bounce/complaint events
 * (delivered via SNS to the webhook in modules/email-events) and, in future, by hand.
 * The worker checks this table before every send, and holding a suppression list is a
 * prerequisite for AWS granting SES production access (PROJECT-BRIEF §7.7).
 */
export type SuppressionReason = "bounce" | "complaint" | "manual";

@Entity({ name: "email_suppressions" })
export class EmailSuppressionEntity extends AppBaseEntity {
  // Stored lowercased; unique so re-suppressing an address is idempotent.
  @Column({ type: "varchar", length: 320 })
  @Index({ unique: true })
  email!: string;

  @Column({ type: "varchar", length: 20 })
  reason!: SuppressionReason;

  // Bounce subtype / complaint type / free text for a manual entry.
  @Column({ type: "text", nullable: true })
  detail?: string | null;
}
