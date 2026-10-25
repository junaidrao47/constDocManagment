import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { SubscriptionEntity } from "../modules/subscriptions/subscription.entity";
import { QuotationEntity } from "../modules/quotations/quotation.entity";
import { PaymentEntity } from "../modules/payments/payment.entity";
import { UserEntity } from "../modules/users/user.entity";

export enum InvoiceStatus {
  Draft = "draft",
  Issued = "issued",
  PartiallyPaid = "partially_paid",
  Paid = "paid",
  Overdue = "overdue",
  Cancelled = "cancelled",
}

@Entity({ name: "invoices" })
export class InvoiceEntity extends AppBaseEntity {
  /** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
  @Column({ name: "is_demo", type: "boolean", default: false })
  isDemo!: boolean;

  @Column({ name: "quotation_id", type: "uuid", nullable: true, unique: true })
  quotationId?: string | null;

  @ManyToOne(() => QuotationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "quotation_id" })
  quotation?: QuotationEntity | null;

  @Column({ name: "invoice_number", type: "varchar", length: 20, unique: true })
  invoiceNumber!: string;

  @Column({ name: "customer_id", type: "uuid" })
  @Index()
  customerId!: string;

  @ManyToOne(() => UserEntity, (user: UserEntity) => user.invoices, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer?: UserEntity;

  @Column({ name: "subscription_id", type: "uuid", nullable: true })
  subscriptionId?: string | null;

  @ManyToOne(() => SubscriptionEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "subscription_id" })
  subscription?: SubscriptionEntity | null;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: "varchar", length: 3, default: "MXN" })
  currency!: string;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  subtotal!: string;

  @Column({ name: "tax_amount", type: "decimal", precision: 12, scale: 2, default: 0 })
  taxAmount!: string;

  @Column({ type: "varchar", length: 50 })
  status!: InvoiceStatus;

  @Column({ name: "due_date", type: "date" })
  dueDate!: string;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt?: Date | null;

  @OneToMany(() => PaymentEntity, (payment) => payment.invoice)
  payments?: PaymentEntity[];
}