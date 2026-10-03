import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "./base.entity";

@Entity({ name: "industries" })
export class IndustryEntity extends AppBaseEntity {
  @Column({ type: "varchar", length: 150 })
  @Index({ unique: true })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  /**
   * Multiplier applied to the worker-base portion of the price.
   * Default 1 means no change to existing prices.
   * Formula: workerBasePrice × locationMultiplier × priceWeight
   */
  @Column({ name: "price_weight", type: "decimal", precision: 8, scale: 4, default: 1 })
  priceWeight!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  @Index()
  isActive!: boolean;
}