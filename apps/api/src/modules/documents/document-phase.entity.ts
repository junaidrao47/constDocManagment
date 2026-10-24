import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";
import { PhaseStatus } from "./phase-status";

/**
 * One ordered approval phase of a document (PROJECT-BRIEF §11.5): a step the
 * manager takes a document through with a government department/authority.
 *
 * `position` orders the phases; it is a plain index (non-unique) so a reorder can
 * swap values inside one transaction without tripping a constraint mid-flight.
 * A phase is `completed` when the manager uploads its result file (version kind
 * `phase_result`, linked by `result_version_id`) or marks it complete with a note.
 */
@Entity({ name: "document_phases" })
@Index(["documentId", "position"])
export class DocumentPhaseEntity extends AppBaseEntity {
  @Column({ name: "document_id", type: "uuid" })
  @Index()
  documentId!: string;

  @Column({ type: "integer" })
  position!: number;

  @Column({ name: "name_en", type: "varchar", length: 150 })
  nameEn!: string;

  @Column({ name: "name_es", type: "varchar", length: 150 })
  nameEs!: string;

  @Column({ type: "varchar", length: 150, nullable: true })
  department?: string | null;

  @Column({ name: "target_date", type: "timestamptz", nullable: true })
  targetDate?: Date | null;

  @Column({ type: "varchar", length: 20, default: PhaseStatus.NotStarted })
  status!: PhaseStatus;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt?: Date | null;

  @Column({ name: "completed_by", type: "uuid", nullable: true })
  completedBy?: string | null;

  @Column({ type: "text", nullable: true })
  note?: string | null;

  @Column({ name: "result_version_id", type: "uuid", nullable: true })
  resultVersionId?: string | null;
}
