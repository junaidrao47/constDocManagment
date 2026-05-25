import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { UserEntity } from "../users/user.entity";
import { ServiceEntity } from "../../entities/service.entity";
import { DocumentStatusHistoryEntity } from "../../entities/document-status-history.entity";
import { DocumentStatus } from "./document-status";

@Entity({ name: "documents" })
export class DocumentEntity extends AppBaseEntity {
	@Column({ name: "customer_id", type: "uuid" })
	@Index()
	customerId!: string;

	@ManyToOne(() => UserEntity, (user) => user.documents, { onDelete: "CASCADE" })
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

	@Column({
		type: "enum",
		enum: DocumentStatus,
		default: DocumentStatus.Pending,
	})
	status!: DocumentStatus;

	@Column({ name: "expires_at", type: "timestamptz", nullable: true })
	expiresAt?: Date | null;

	@OneToMany(() => DocumentStatusHistoryEntity, (history) => history.document)
	statusHistory?: DocumentStatusHistoryEntity[];
}
