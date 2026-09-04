import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { DocumentEntity } from "../modules/documents/document.entity";
import { UserEntity } from "../modules/users/user.entity";
import { DocumentStatus } from "../modules/documents/document-status";

@Entity({ name: "document_status_history" })
export class DocumentStatusHistoryEntity extends AppBaseEntity {
  @Column({ name: "document_id", type: "uuid" })
  documentId!: string;

  @ManyToOne(() => DocumentEntity, (document: DocumentEntity) => document.statusHistory, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document?: DocumentEntity;

  @Column({ name: "from_status", type: "enum", enum: DocumentStatus, enumName: "document_status_enum", nullable: true })
  fromStatus?: DocumentStatus | null;

  @Column({
    name: "to_status",
    type: "enum",
    enum: DocumentStatus, enumName: "document_status_enum",
  })
  toStatus!: DocumentStatus;

  @Column({ name: "changed_by", type: "uuid", nullable: true })
  changedBy?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "changed_by" })
  changedByUser?: UserEntity | null;

  @Column({ type: "text", nullable: true })
  note?: string | null;
}