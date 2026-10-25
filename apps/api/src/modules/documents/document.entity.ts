import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { UserEntity } from "../users/user.entity";
import { ServiceEntity } from "../../entities/service.entity";
import { DocumentStatusHistoryEntity } from "../../entities/document-status-history.entity";
import { DocumentStatus } from "./document-status";

@Entity({ name: "documents" })
export class DocumentEntity extends AppBaseEntity {
	/** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
	@Column({ name: "is_demo", type: "boolean", default: false })
	isDemo!: boolean;

	@Column({ name: "customer_id", type: "uuid" })
	@Index()
	customerId!: string;

	@ManyToOne(() => UserEntity, (user: UserEntity) => user.documents, { onDelete: "CASCADE" })
	@JoinColumn({ name: "customer_id" })
	customer?: UserEntity;

	@Column({ name: "service_id", type: "uuid", nullable: true })
	serviceId?: string | null;

	@ManyToOne(() => ServiceEntity, { nullable: true, onDelete: "SET NULL" })
	@JoinColumn({ name: "service_id" })
	service?: ServiceEntity | null;

	@Column({ name: "file_name", type: "varchar", length: 255 })
	fileName!: string;

	@Column({ name: "s3_key", type: "varchar", length: 512 })
	s3Key!: string;

	@Column({ name: "approved_file_name", type: "varchar", length: 255, nullable: true })
	approvedFileName?: string | null;

	@Column({ name: "approved_s3_key", type: "varchar", length: 512, nullable: true })
	approvedS3Key?: string | null;

	@Column({ name: "approved_uploaded_by", type: "uuid", nullable: true })
	approvedUploadedBy?: string | null;

	@Column({ name: "approved_uploaded_at", type: "timestamptz", nullable: true })
	approvedUploadedAt?: Date | null;

	// The latest ready, non-official version — the customer's current submission.
	// Nullable: a document exists from the moment an upload target is issued, before
	// any version is confirmed ready.
	@Column({ name: "current_version_id", type: "uuid", nullable: true })
	currentVersionId?: string | null;

	// Which service-required-document (checklist item) this document satisfies, if any.
	@Column({ name: "requirement_id", type: "uuid", nullable: true })
	requirementId?: string | null;

	@Column({
		type: "enum",
		enum: DocumentStatus, enumName: "document_status_enum",
		default: DocumentStatus.Pending,
	})
	status!: DocumentStatus;

	@Column({ name: "expires_at", type: "timestamptz", nullable: true })
	expiresAt?: Date | null;

	// Manager's target date for the whole document's government approval (PROJECT-BRIEF §11.5).
	@Column({ name: "target_date", type: "timestamptz", nullable: true })
	targetDate?: Date | null;

	@OneToMany(() => DocumentStatusHistoryEntity, (history: DocumentStatusHistoryEntity) => history.document)
	statusHistory?: DocumentStatusHistoryEntity[];
}
