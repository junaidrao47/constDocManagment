import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";

export enum ContentStatus {
  Draft = "draft",
  Published = "published",
}

/**
 * Editable site copy, one row per (content_key, locale).
 *
 * `contentKey` is a key from the typed registry in content-registry.ts (free-form keys
 * are rejected on write). `value` is sanitized plain/restricted text — never raw HTML.
 * Optional presentation hints (font/weight/size) come from the fixed allow-lists in
 * cms-settings.ts; there is no free-form CSS.
 */
@Entity({ name: "site_content" })
@Index(["contentKey", "locale"], { unique: true })
export class SiteContentEntity extends AppBaseEntity {
  @Column({ name: "content_key", type: "varchar", length: 150 })
  contentKey!: string;

  /** "en" or "es" — the same two-value locale the rest of the stack uses. */
  @Column({ type: "varchar", length: 10 })
  locale!: string;

  @Column({ type: "text", default: "" })
  value!: string;

  @Column({ type: "varchar", length: 20, default: ContentStatus.Draft })
  status!: ContentStatus;

  @Column({ name: "font_family", type: "varchar", length: 50, nullable: true })
  fontFamily?: string | null;

  @Column({ name: "font_weight", type: "integer", nullable: true })
  fontWeight?: number | null;

  /** One of sm | md | lg | xl. */
  @Column({ name: "size_step", type: "varchar", length: 5, nullable: true })
  sizeStep?: string | null;

  @Column({ type: "integer", default: 1 })
  version!: number;

  @Column({ name: "updated_by", type: "uuid", nullable: true })
  updatedBy?: string | null;
}

/**
 * Append-only history of published content, so GET history can show past versions.
 * A new row is written every time a key/locale is published.
 */
@Entity({ name: "site_content_history" })
@Index(["contentKey", "locale", "version"])
export class SiteContentHistoryEntity extends AppBaseEntity {
  @Column({ name: "content_key", type: "varchar", length: 150 })
  contentKey!: string;

  @Column({ type: "varchar", length: 10 })
  locale!: string;

  @Column({ type: "text" })
  value!: string;

  @Column({ type: "integer" })
  version!: number;

  @Column({ name: "published_by", type: "uuid", nullable: true })
  publishedBy?: string | null;
}
