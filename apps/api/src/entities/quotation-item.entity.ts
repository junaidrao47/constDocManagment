import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { QuotationEntity } from "../modules/quotations/quotation.entity";
import { ServiceEntity } from "./service.entity";

export type QuotationItemKind = "service" | "addon" | "gov_fee" | "discount" | "tax" | "worker_base";

@Entity({ name: "quotation_items" })
@Unique(["quotationId", "serviceId"])
export class QuotationItemEntity extends AppBaseEntity {
  @Column({ name: "quotation_id", type: "uuid" })
  quotationId!: string;

  @ManyToOne(() => QuotationEntity, (quotation: QuotationEntity) => quotation.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "quotation_id" })
  quotation?: QuotationEntity;

  @Column({ name: "service_id", type: "uuid", nullable: true })
  serviceId?: string | null;

  @ManyToOne(() => ServiceEntity, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "service_id" })
  service?: ServiceEntity | null;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  price!: string;

  @Column({ type: "varchar", length: 50, default: "service" })
  kind!: QuotationItemKind;

  @Column({ type: "varchar", length: 200, nullable: true })
  label?: string | null;

  @Column({ type: "integer", default: 1 })
  quantity!: number;

  @Column({ name: "unit_price", type: "decimal", precision: 12, scale: 2, default: 0 })
  unitPrice!: string;

  @Column({ name: "line_total", type: "decimal", precision: 12, scale: 2, default: 0 })
  lineTotal!: string;

  get unit_price(): string {
    return this.unitPrice;
  }
  set unit_price(value: string) {
    this.unitPrice = value;
  }

  get line_total(): string {
    return this.lineTotal;
  }
  set line_total(value: string) {
    this.lineTotal = value;
  }
}