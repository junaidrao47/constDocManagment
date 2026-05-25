import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { UserEntity } from "../modules/users/user.entity";

@Entity({ name: "notifications_log" })
export class NotificationLogEntity extends AppBaseEntity {
  @Column({ name: "user_id", type: "uuid" })
  @Index()
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ type: "varchar", length: 100 })
  type!: string;

  @Column({ type: "varchar", length: 50 })
  channel!: string;

  @Column({ type: "varchar", length: 50 })
  status!: string;

  @Column({ name: "sent_at", type: "timestamptz", nullable: true })
  sentAt?: Date | null;
}