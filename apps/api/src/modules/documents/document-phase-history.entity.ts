import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";

/**
 * Append-only history of every phase change (PROJECT-BRIEF §11.5). Written in the
 * same transaction as the change it records, so a phase never moves without a
 * history row. `document_id` is denormalised alongside `phase_id` so the full
 * document timeline can be read without joining through phases.
 */
@Entity({ name: "document_phase_history" })
export class DocumentPhaseHistoryEntity extends AppBaseEntity {
  @Column({ name: "phase_id", type: "uuid" })
  @Index()
  phaseId!: string;

  @Column({ name: "document_id", type: "uuid" })
  @Index()
  documentId!: string;

  @Column({ name: "from_status", type: "varchar", length: 20, nullable: true })
  fromStatus?: string | null;

  @Column({ name: "to_status", type: "varchar", length: 20 })
  toStatus!: string;

  @Column({ type: "text", nullable: true })
  note?: string | null;

  @Column({ name: "changed_by", type: "uuid", nullable: true })
  changedBy?: string | null;
}
