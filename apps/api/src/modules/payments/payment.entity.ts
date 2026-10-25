import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { InvoiceEntity } from "../../entities/invoice.entity";
import { UserEntity } from "../users/user.entity";

export enum PaymentMethod {
	BankTransfer = "bank_transfer",
	Spei = "spei",
	Cash = "cash",
	Other = "other",
}

@Entity({ name: "payments" })
export class PaymentEntity {
	/** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
	@Column({ name: "is_demo", type: "boolean", default: false })
	isDemo!: boolean;

	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column({ name: "invoice_id", type: "uuid" })
	@Index()
	invoiceId!: string;

	@ManyToOne(() => InvoiceEntity, { onDelete: "CASCADE" })
	@JoinColumn({ name: "invoice_id" })
	invoice?: InvoiceEntity;

	@Column({ type: "decimal", precision: 12, scale: 2 })
	amount!: string;

	@Column({ type: "varchar", length: 30 })
	method!: PaymentMethod;

	@Column({ type: "varchar", length: 255, nullable: true })
	reference?: string | null;

	@Column({ name: "paid_at", type: "timestamptz", nullable: true })
	paidAt?: Date | null;

	@Column({ name: "recorded_by", type: "uuid", nullable: true })
	recordedBy?: string | null;

	@ManyToOne(() => UserEntity, { nullable: true, onDelete: "RESTRICT" })
	@JoinColumn({ name: "recorded_by" })
	recorder?: UserEntity;

	@Column({ type: "text", nullable: true })
	note?: string | null;

	@CreateDateColumn({ name: "created_at", type: "timestamptz", default: () => "now()" })
	createdAt!: Date;
}
