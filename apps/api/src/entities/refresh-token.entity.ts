import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AppBaseEntity } from "./base.entity";
import { UserEntity } from "../modules/users/user.entity";

@Entity({ name: "refresh_tokens" })
export class RefreshTokenEntity extends AppBaseEntity {
  @Column({ name: "user_id", type: "uuid" })
  @Index()
  userId!: string;

  @ManyToOne(() => UserEntity, (user: UserEntity) => user.refreshTokens, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ name: "token_hash", type: "varchar", length: 255 })
  tokenHash!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "boolean", default: false })
  revoked!: boolean;
}