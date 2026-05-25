import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "./base.entity";

@Entity({ name: "locations" })
export class LocationEntity extends AppBaseEntity {
  @Column({ type: "varchar", length: 100 })
  state!: string;

  @Column({ type: "varchar", length: 100 })
  city!: string;

  @Column({ type: "decimal", precision: 8, scale: 4, default: 1 })
  multiplier!: string;

  @Column({ name: "city_fee", type: "decimal", precision: 12, scale: 2, default: 0 })
  cityFee!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  @Index()
  isActive!: boolean;
}