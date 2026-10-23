import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { ServiceEntity } from "../../entities/service.entity";

/**
 * A document a service requires the customer to submit (the checklist item).
 *
 * Bilingual copy, like categories; `allowed_mime_types` optionally narrows the
 * global upload allow-list for this specific requirement (null = the global list).
 */
@Entity({ name: "service_required_documents" })
export class ServiceRequiredDocumentEntity extends AppBaseEntity {
  @Column({ name: "service_id", type: "uuid" })
  @Index()
  serviceId!: string;

  @ManyToOne(() => ServiceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "service_id" })
  service?: ServiceEntity;

  @Column({ name: "name_en", type: "varchar", length: 150 })
  nameEn!: string;

  @Column({ name: "name_es", type: "varchar", length: 150 })
  nameEs!: string;

  @Column({ name: "description_en", type: "text", nullable: true })
  descriptionEn?: string | null;

  @Column({ name: "description_es", type: "text", nullable: true })
  descriptionEs?: string | null;

  @Column({ name: "is_required", type: "boolean", default: true })
  isRequired!: boolean;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "allowed_mime_types", type: "jsonb", nullable: true })
  allowedMimeTypes?: string[] | null;
}
