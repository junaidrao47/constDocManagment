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

/**
 * Where a customer account sits in the approval lifecycle (PROJECT-BRIEF §11.1).
 * Staff and every pre-existing account are `approved`; a self-registered customer
 * starts `pending_approval` and cannot use the portal until an admin approves it.
 */
export enum AccountStatus {
	PendingApproval = "pending_approval",
	Approved = "approved",
	Suspended = "suspended",
}

/** The user's chosen language; drives emails and PDFs. Default es-MX (client is Mexican). */
export enum UserLocale {
	En = "en",
	EsMX = "es-MX",
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
		enum: UserRole, enumName: "user_role_enum",
		default: UserRole.Customer,
	})
	role!: UserRole;

	@Column({ name: "is_active", type: "boolean", default: true })
	isActive!: boolean;

	/**
	 * Approval lifecycle. DB default is `approved` so staff/admin inserts and any
	 * backfilled row are usable; the register service overrides it to
	 * `pending_approval` for self-registered customers.
	 */
	@Column({
		name: "account_status",
		type: "enum",
		enum: AccountStatus, enumName: "account_status_enum",
		default: AccountStatus.Approved,
	})
	accountStatus!: AccountStatus;

	@Column({
		name: "preferred_locale",
		type: "enum",
		enum: UserLocale, enumName: "user_locale_enum",
		default: UserLocale.EsMX,
	})
	preferredLocale!: UserLocale;

	/**
	 * Tokens issued before this moment are refused. Set on password reset and on
	 * any admin change to role or active status, so a stateless access token cannot
	 * outlive the permissions it was minted with. NULL means never invalidated.
	 */
	@Column({ name: "tokens_valid_from", type: "timestamptz", nullable: true })
	tokensValidFrom?: Date | null;

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
