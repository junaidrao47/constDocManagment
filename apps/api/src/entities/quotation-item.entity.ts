import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { QuotationEntity } from "../modules/quotations/quotation.entity";
import { ServiceEntity } from "./service.entity";

@Entity({ name: "quotation_items" })
@Unique(["quotationId", "serviceId"])
export class QuotationItemEntity extends AppBaseEntity {
  @Column({ name: "quotation_id", type: "uuid" })
  quotationId!: string;

  @ManyToOne(() => QuotationEntity, (quotation) => quotation.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "quotation_id" })
  quotation?: QuotationEntity;

  @Column({ name: "service_id", type: "uuid" })
  serviceId!: string;

  @ManyToOne(() => ServiceEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "service_id" })
  service?: ServiceEntity;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  price!: string;
}