import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * Key-value store for admin-editable application settings.
 * The primary key is `key` (not a UUID) because settings are addressed by name.
 * Whitelisted keys: "currency", "quote_validity_days".
 */
@Entity({ name: "app_settings" })
export class AppSettingEntity {
  @PrimaryColumn({ type: "varchar", length: 100 })
  key!: string;

  /** Stored as JSONB so strings, numbers, and booleans all fit one column. */
  @Column({ type: "jsonb" })
  value!: unknown;

  @Column({ name: "updated_by", type: "uuid", nullable: true })
  updatedBy?: string | null;

  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
