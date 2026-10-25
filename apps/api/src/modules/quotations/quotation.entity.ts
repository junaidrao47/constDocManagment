import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { UserEntity } from "../users/user.entity";
import { IndustryEntity } from "../../entities/industry.entity";
import { LocationEntity } from "../../entities/location.entity";
import { QuotationItemEntity } from "../../entities/quotation-item.entity";

@Entity({ name: "quotations" })
export class QuotationEntity extends AppBaseEntity {
	/** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
	@Column({ name: "is_demo", type: "boolean", default: false })
	isDemo!: boolean;

	@Column({ name: "customer_id", type: "uuid" })
	@Index()
	customerId!: string;

	@ManyToOne(() => UserEntity, (user: UserEntity) => user.quotations, { onDelete: "CASCADE" })
	@JoinColumn({ name: "customer_id" })
	customer?: UserEntity;

	@Column({ name: "industry_id", type: "uuid" })
	@Index()
	industryId!: string;

	@ManyToOne(() => IndustryEntity, { onDelete: "RESTRICT" })
	@JoinColumn({ name: "industry_id" })
	industry?: IndustryEntity;

	@Column({ name: "location_id", type: "uuid" })
	@Index()
	locationId!: string;

	@ManyToOne(() => LocationEntity, { onDelete: "RESTRICT" })
	@JoinColumn({ name: "location_id" })
	location?: LocationEntity;

	@Column({ name: "worker_count", type: "integer" })
	workerCount!: number;

	@Column({ name: "total_price", type: "decimal", precision: 12, scale: 2 })
	totalPrice!: string;

	@Column({ type: "varchar", length: 3, default: "MXN" })
	currency!: string;

	@Column({ type: "varchar", length: 50 })
	status!: string;

	@Column({ name: "rejection_reason", type: "text", nullable: true })
	rejectionReason?: string | null;

	@Column({ name: "sent_at", type: "timestamptz", nullable: true })
	sentAt?: Date | null;

	@Column({ name: "accepted_at", type: "timestamptz", nullable: true })
	acceptedAt?: Date | null;

	@Column({ name: "expires_at", type: "timestamptz", nullable: true })
	expiresAt?: Date | null;

	// cascade: ["insert"] is load-bearing. Both quotationService.create() and
	// staffCreate() build their line items inline and rely on save() to persist
	// them; without it TypeORM silently dropped every item and quotation_items
	// stayed empty in Postgres. The Jest fake repository keeps the object graph in
	// memory, so the suite never saw it.
	@OneToMany(() => QuotationItemEntity, (item) => item.quotation, { cascade: ["insert"] })
	items?: QuotationItemEntity[];
}
