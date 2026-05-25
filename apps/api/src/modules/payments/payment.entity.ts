import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { InvoiceEntity } from "../../entities/invoice.entity";

@Entity({ name: "payments" })
export class PaymentEntity extends AppBaseEntity {
	@Column({ name: "invoice_id", type: "uuid" })
	@Index()
	invoiceId!: string;

	@ManyToOne(() => InvoiceEntity, { onDelete: "CASCADE" })
	@JoinColumn({ name: "invoice_id" })
	invoice?: InvoiceEntity;

	@Column({ name: "gateway_ref", type: "varchar", length: 255, nullable: true })
	gatewayRef?: string | null;

	@Column({ type: "decimal", precision: 12, scale: 2 })
	amount!: string;

	@Column({ type: "varchar", length: 50 })
	status!: string;

	@Column({ name: "paid_at", type: "timestamptz", nullable: true })
	paidAt?: Date | null;
}
