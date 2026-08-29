import { Column, Entity, Index, OneToMany } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { RefreshTokenEntity } from "../../entities/refresh-token.entity";
import { QuotationEntity } from "../quotations/quotation.entity";
import { DocumentEntity } from "../documents/document.entity";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { InvoiceEntity } from "../../entities/invoice.entity";
import { NotificationLogEntity } from "../../entities/notification-log.entity";
import { DocumentStatusHistoryEntity } from "../../entities/document-status-history.entity";

export enum UserRole {
	Customer = "customer",
	Agent = "agent",
	Manager = "manager",
	Admin = "admin",
}

@Entity({ name: "users" })
export class UserEntity extends AppBaseEntity {
	@Column({ type: "varchar", length: 150, nullable: true })
	name?: string | null;

	@Column({ type: "varchar", length: 30, nullable: true })
	phone?: string | null;

	@Column({ type: "varchar", length: 150 })
	@Index({ unique: true })
	email!: string;

	@Column({ name: "password_hash", type: "varchar", length: 255 })
	passwordHash!: string;

	@Column({
		type: "enum",
		enum: UserRole,
		default: UserRole.Customer,
	})
	role!: UserRole;

	@Column({ name: "is_active", type: "boolean", default: true })
	isActive!: boolean;

	@OneToMany(() => RefreshTokenEntity, (refreshToken: RefreshTokenEntity) => refreshToken.user)
	refreshTokens?: RefreshTokenEntity[];

	@OneToMany(() => QuotationEntity, (quotation: QuotationEntity) => quotation.customer)
	quotations?: QuotationEntity[];

	@OneToMany(() => DocumentEntity, (document: DocumentEntity) => document.customer)
	documents?: DocumentEntity[];

	@OneToMany(() => SubscriptionEntity, (subscription: SubscriptionEntity) => subscription.customer)
	subscriptions?: SubscriptionEntity[];

	@OneToMany(() => InvoiceEntity, (invoice: InvoiceEntity) => invoice.customer)
	invoices?: InvoiceEntity[];

	@OneToMany(() => NotificationLogEntity, (notification: NotificationLogEntity) => notification.user)
	notifications?: NotificationLogEntity[];

	@OneToMany(() => DocumentStatusHistoryEntity, (history: DocumentStatusHistoryEntity) => history.changedByUser)
	documentStatusChanges?: DocumentStatusHistoryEntity[];
}
