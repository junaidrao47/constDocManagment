import { Column, Entity, Index } from "typeorm";
import { AppBaseEntity } from "./base.entity";

@Entity({ name: "industries" })
export class IndustryEntity extends AppBaseEntity {
  @Column({ type: "varchar", length: 150 })
  @Index({ unique: true })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;
}