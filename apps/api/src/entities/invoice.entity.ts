import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { SubscriptionEntity } from "../modules/subscriptions/subscription.entity";
import { UserEntity } from "../modules/users/user.entity";

@Entity({ name: "invoices" })
export class InvoiceEntity extends AppBaseEntity {
  @Column({ name: "customer_id", type: "uuid" })
  @Index()
  customerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer?: UserEntity;

  @Column({ name: "subscription_id", type: "uuid", nullable: true })
  subscriptionId?: string | null;

  @ManyToOne(() => SubscriptionEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "subscription_id" })
  subscription?: SubscriptionEntity | null;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: "varchar", length: 50 })
  status!: string;

  @Column({ name: "due_date", type: "date" })
  dueDate!: string;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt?: Date | null;
}