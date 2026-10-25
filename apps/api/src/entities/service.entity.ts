import { Column, Entity, Index, JoinColumn, ManyToOne, ManyToMany } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { PackageEntity } from "../modules/packages/package.entity";
import { CategoryEntity } from "../modules/categories/category.entity";

@Entity({ name: "services" })
export class ServiceEntity extends AppBaseEntity {
  /** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
  @Column({ name: "is_demo", type: "boolean", default: false })
  isDemo!: boolean;

  @Column({ type: "varchar", length: 150 })
  @Index({ unique: true })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  // Bilingual display fields. `name`/`description` above stay as the canonical,
  // unique admin key; these carry the es/en copy the public site renders.
  @Column({ name: "name_en", type: "varchar", length: 150 })
  nameEn!: string;

  @Column({ name: "name_es", type: "varchar", length: 150 })
  nameEs!: string;

  @Column({ name: "description_en", type: "text", nullable: true })
  descriptionEn?: string | null;

  @Column({ name: "description_es", type: "text", nullable: true })
  descriptionEs?: string | null;

  @Column({ name: "base_price", type: "decimal", precision: 12, scale: 2, default: 0 })
  basePrice!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "category_id", type: "uuid" })
  categoryId!: string;

  @ManyToOne(() => CategoryEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "category_id" })
  category?: CategoryEntity;

  @ManyToMany(() => PackageEntity, (pkg) => pkg.services)
  packages?: PackageEntity[];
}
