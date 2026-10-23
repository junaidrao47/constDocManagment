import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { DocumentEntity } from "./document.entity";

export type DocumentVersionKind = "customer" | "staff_on_behalf" | "official";

/** `intent` = an upload target was issued but the bytes are not confirmed yet. */
export type DocumentVersionStatus = "intent" | "ready";

/**
 * One uploaded (or being-uploaded) file for a document.
 *
 * Official files are `kind='official'` and are kept as their own rows — they never
 * overwrite a customer version, so the full submission history survives. `status`
 * and `intent_expires_at` drive the two-step upload: an intent is created first and
 * only becomes `ready` once its bytes are confirmed (HEAD + magic-byte check).
 */
@Entity({ name: "document_versions" })
@Index(["documentId", "versionNo"])
export class DocumentVersionEntity extends AppBaseEntity {
  @Column({ name: "document_id", type: "uuid" })
  @Index()
  documentId!: string;

  @ManyToOne(() => DocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document?: DocumentEntity;

  @Column({ name: "version_no", type: "integer" })
  versionNo!: number;

  @Column({ type: "varchar", length: 30 })
  kind!: DocumentVersionKind;

  @Column({ name: "storage_key", type: "varchar", length: 512 })
  storageKey!: string;

  @Column({ name: "file_name", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ name: "mime_type", type: "varchar", length: 200, nullable: true })
  mimeType?: string | null;

  @Column({ name: "size_bytes", type: "bigint", nullable: true })
  sizeBytes?: string | null;

  @Column({ name: "uploaded_by", type: "uuid", nullable: true })
  uploadedBy?: string | null;

  @Column({ name: "uploaded_by_role", type: "varchar", length: 30 })
  uploadedByRole!: string;

  @Column({ type: "varchar", length: 20, default: "intent" })
  status!: DocumentVersionStatus;

  @Column({ name: "intent_expires_at", type: "timestamptz", nullable: true })
  intentExpiresAt?: Date | null;
}
