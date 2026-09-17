import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { QuotationEntity } from "../modules/quotations/quotation.entity";

@Entity({ name: "quotation_status_history" })
export class QuotationStatusHistoryEntity extends AppBaseEntity {
  @Column({ name: "quotation_id", type: "uuid" })
  @Index()
  quotationId!: string;

  @ManyToOne(() => QuotationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "quotation_id" })
  quotation?: QuotationEntity;

  @Column({ name: "from_status", type: "varchar", length: 50, nullable: true })
  fromStatus?: string | null;

  @Column({ name: "to_status", type: "varchar", length: 50 })
  toStatus!: string;

  @Column({ name: "changed_by", type: "uuid", nullable: true })
  changedBy?: string | null;

  @Column({ type: "text", nullable: true })
  note?: string | null;
}