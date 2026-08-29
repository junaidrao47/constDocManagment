import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { UserEntity } from "../users/user.entity";
import { IndustryEntity } from "../../entities/industry.entity";
import { LocationEntity } from "../../entities/location.entity";
import { QuotationItemEntity } from "../../entities/quotation-item.entity";

@Entity({ name: "quotations" })
export class QuotationEntity extends AppBaseEntity {
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

	@Column({ type: "varchar", length: 50 })
	status!: string;

	@Column({ name: "expires_at", type: "timestamptz", nullable: true })
	expiresAt?: Date | null;

	@OneToMany(() => QuotationItemEntity, (item) => item.quotation)
	items?: QuotationItemEntity[];
}
