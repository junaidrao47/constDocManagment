import { Column, Entity, Index, ManyToMany } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { PackageEntity } from "../modules/packages/package.entity";

@Entity({ name: "services" })
export class ServiceEntity extends AppBaseEntity {
  @Column({ type: "varchar", length: 150 })
  @Index({ unique: true })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ name: "base_price", type: "decimal", precision: 12, scale: 2, default: 0 })
  basePrice!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @ManyToMany(() => PackageEntity, (pkg) => pkg.services)
  packages?: PackageEntity[];
}