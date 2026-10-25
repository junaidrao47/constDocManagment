import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";

/**
 * A category every service and every package must belong to (exactly one).
 *
 * Deliberately NOT the same thing as `catalog_categories`: that is the generic,
 * hierarchical, single-language CMS taxonomy (`modules/catalog`). This table is
 * flat and bilingual and is the one the real services/packages and the public
 * site cards key off. See docs/decision-log.md (2026-10-20).
 */
@Entity({ name: "categories" })
export class CategoryEntity extends AppBaseEntity {
  /** W1 demo-data flag; demo rows are removed by scripts/purge-demo.ts. */
  @Column({ name: "is_demo", type: "boolean", default: false })
  isDemo!: boolean;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 180 })
  slug!: string;

  @Column({ name: "name_en", type: "varchar", length: 150 })
  nameEn!: string;

  @Column({ name: "name_es", type: "varchar", length: 150 })
  nameEs!: string;

  @Column({ name: "description_en", type: "text", nullable: true })
  descriptionEn?: string | null;

  @Column({ name: "description_es", type: "text", nullable: true })
  descriptionEs?: string | null;

  /** A string key the frontend maps to an icon component; not a URL. */
  @Column({ type: "varchar", length: 60, nullable: true })
  icon?: string | null;

  @Column({ name: "image_url", type: "varchar", length: 1024, nullable: true })
  imageUrl?: string | null;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;
}
