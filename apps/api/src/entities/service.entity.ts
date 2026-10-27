import { Column, Entity, Index, JoinColumn, ManyToOne, ManyToMany } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { PackageEntity } from "../modules/packages/package.entity";
import { CategoryEntity } from "../modules/categories/category.entity";

/** One numbered step in a service's "how it works after you buy" process. */
export interface ServiceProcessStep {
  title: string;
  description: string;
}

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

  // Marketing image for the public service card and detail hero. `imageUrl` is what the
  // site renders (a local `/api/public/catalog/images/...` path, or an absolute S3 URL);
  // `imageKey` is the storage key kept so a replaced object can be removed. Both nullable —
  // a service with no image falls back to its category image. Stored via
  // `saveCatalogObject(id, "service", ...)`, mirroring packages.
  @Column({ name: "image_url", type: "varchar", length: 1024, nullable: true })
  imageUrl?: string | null;

  @Column({ name: "image_key", type: "varchar", length: 512, nullable: true })
  imageKey?: string | null;

  // Structured "what you get / what happens after you buy" content for the public detail
  // page. Bilingual, mirroring name/description. `whatsIncluded*` is a bullet list; each
  // `processSteps*` entry is a { title, description } rendered as a numbered step. JSONB so
  // the shape can grow without a migration; default to an empty list.
  @Column({ name: "whats_included_en", type: "jsonb", default: () => "'[]'" })
  whatsIncludedEn!: string[];

  @Column({ name: "whats_included_es", type: "jsonb", default: () => "'[]'" })
  whatsIncludedEs!: string[];

  @Column({ name: "process_steps_en", type: "jsonb", default: () => "'[]'" })
  processStepsEn!: ServiceProcessStep[];

  @Column({ name: "process_steps_es", type: "jsonb", default: () => "'[]'" })
  processStepsEs!: ServiceProcessStep[];

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
