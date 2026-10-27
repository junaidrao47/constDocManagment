import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "../../entities/base.entity";

/** Transition styles allowed on a hero slide. Kept in sync with HERO_TRANSITIONS in cms.schema.ts. */
export enum HeroTransition {
  Fade = "fade",
  Slide = "slide",
  Zoom = "zoom",
}

/**
 * One slide in the public homepage hero carousel.
 *
 * Images live in a dedicated PUBLIC S3 prefix (`public/hero/...`) via `saveHeroObject`
 * in utils/s3 — never the private documents bucket. `imageKey` is the storage key kept
 * so a replaced/removed slide's object can be deleted; `imageUrl` is what the site renders.
 *
 * Bilingual text (EN + es-MX) is stored side by side so the public endpoint can serve
 * whichever the visitor's locale asks for, with the other as a fallback.
 */
@Entity({ name: "hero_slides" })
@Index(["isActive", "position"])
export class HeroSlideEntity extends AppBaseEntity {
  @Column({ name: "image_key", type: "varchar", length: 512 })
  imageKey!: string;

  @Column({ name: "image_url", type: "varchar", length: 1024 })
  imageUrl!: string;

  @Column({ name: "alt_en", type: "varchar", length: 255, nullable: true })
  altEn?: string | null;

  @Column({ name: "alt_es", type: "varchar", length: 255, nullable: true })
  altEs?: string | null;

  @Column({ name: "headline_en", type: "varchar", length: 200, nullable: true })
  headlineEn?: string | null;

  @Column({ name: "headline_es", type: "varchar", length: 200, nullable: true })
  headlineEs?: string | null;

  @Column({ name: "subheadline_en", type: "varchar", length: 400, nullable: true })
  subheadlineEn?: string | null;

  @Column({ name: "subheadline_es", type: "varchar", length: 400, nullable: true })
  subheadlineEs?: string | null;

  @Column({ name: "cta_label_en", type: "varchar", length: 80, nullable: true })
  ctaLabelEn?: string | null;

  @Column({ name: "cta_label_es", type: "varchar", length: 80, nullable: true })
  ctaLabelEs?: string | null;

  /** Relative ("/services") or absolute https URL only — enforced in cms.schema.ts. */
  @Column({ name: "cta_url", type: "varchar", length: 1024, nullable: true })
  ctaUrl?: string | null;

  @Column({ type: "integer", default: 0 })
  position!: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  /** Per-slide display time in ms (2000–15000). Falls back to the global default when unset. */
  @Column({ name: "duration_ms", type: "integer", nullable: true })
  durationMs?: number | null;

  @Column({ type: "varchar", length: 20, default: HeroTransition.Fade })
  transition!: HeroTransition;

  /** Dark overlay strength over the photo, 0–0.8, for headline legibility. */
  @Column({ name: "overlay_opacity", type: "real", default: 0.4 })
  overlayOpacity!: number;

  /** Focal point as a percentage (0–100) so the image stays framed when cropped. */
  @Column({ name: "focal_x", type: "integer", default: 50 })
  focalX!: number;

  @Column({ name: "focal_y", type: "integer", default: 50 })
  focalY!: number;

  /** Optional schedule window; a slide only shows between starts_at and ends_at when set. */
  @Column({ name: "starts_at", type: "timestamptz", nullable: true })
  startsAt?: Date | null;

  @Column({ name: "ends_at", type: "timestamptz", nullable: true })
  endsAt?: Date | null;

  @Column({ name: "updated_by", type: "uuid", nullable: true })
  updatedBy?: string | null;
}
