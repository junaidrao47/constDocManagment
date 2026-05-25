import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { UserEntity } from "../users/user.entity";
import { PackageEntity } from "../packages/package.entity";

@Entity({ name: "subscriptions" })
export class SubscriptionEntity extends AppBaseEntity {
	@Column({ name: "customer_id", type: "uuid" })
	@Index()
	customerId!: string;

	@ManyToOne(() => UserEntity, (user) => user.subscriptions, { onDelete: "CASCADE" })
	@JoinColumn({ name: "customer_id" })
	customer?: UserEntity;

	@Column({ name: "package_id", type: "uuid" })
	@Index()
	packageId!: string;

	@ManyToOne(() => PackageEntity, (pkg) => pkg.subscriptions, { onDelete: "RESTRICT" })
	@JoinColumn({ name: "package_id" })
	package?: PackageEntity;

	@Column({ name: "start_date", type: "date" })
	startDate!: string;

	@Column({ name: "end_date", type: "date" })
	endDate!: string;

	@Column({ type: "varchar", length: 50 })
	status!: string;
}
