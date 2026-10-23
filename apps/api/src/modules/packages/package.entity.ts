import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { ServiceEntity } from "../../entities/service.entity";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { CategoryEntity } from "../categories/category.entity";

@Entity({ name: "packages" })
export class PackageEntity extends AppBaseEntity {
	@Column({ type: "varchar", length: 150 })
	@Index({ unique: true })
	name!: string;

	// Bilingual display fields; `name`/`description` stay as the canonical unique key.
	@Column({ name: "name_en", type: "varchar", length: 150 })
	nameEn!: string;

	@Column({ name: "name_es", type: "varchar", length: 150 })
	nameEs!: string;

	@Column({ name: "description_en", type: "text", nullable: true })
	descriptionEn?: string | null;

	@Column({ name: "description_es", type: "text", nullable: true })
	descriptionEs?: string | null;

	@Column({ name: "category_id", type: "uuid" })
	categoryId!: string;

	@ManyToOne(() => CategoryEntity, { onDelete: "RESTRICT" })
	@JoinColumn({ name: "category_id" })
	category?: CategoryEntity;

	@Column({ type: "varchar", length: 50 })
	type!: string;

	@Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
	price!: string;

	@Column({ name: "duration_days", type: "integer" })
	durationDays!: number;

	@Column({ type: "text", nullable: true })
	description?: string | null;

	/** Featured packages sort first, then by sortOrder, then by name. */
	@Column({ name: "is_featured", type: "boolean", default: false })
	isFeatured!: boolean;

	@Column({ name: "sort_order", type: "integer", default: 0 })
	sortOrder!: number;

	/**
	 * Retired packages stay in the database for the subscriptions that reference
	 * them, but leave the public catalogue. Indexed because the public list filters
	 * on it on every request.
	 */
	@Column({ name: "is_active", type: "boolean", default: true })
	@Index()
	isActive!: boolean;

	@ManyToMany(() => ServiceEntity, { eager: false })
	@JoinTable({
		name: "package_services",
		joinColumn: { name: "package_id", referencedColumnName: "id" },
		inverseJoinColumn: { name: "service_id", referencedColumnName: "id" },
	})
	services?: ServiceEntity[];

	@OneToMany(() => SubscriptionEntity, (subscription: SubscriptionEntity) => subscription.package)
	subscriptions?: SubscriptionEntity[];
}
