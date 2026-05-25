import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "./base.entity";

@Entity({ name: "worker_ranges" })
export class WorkerRangeEntity extends AppBaseEntity {
  @Column({ name: "min_workers", type: "integer" })
  minWorkers!: number;

  @Column({ name: "max_workers", type: "integer", nullable: true })
  maxWorkers?: number | null;

  @Column({ name: "base_price", type: "decimal", precision: 12, scale: 2, default: 0 })
  basePrice!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  @Index()
  isActive!: boolean;
}