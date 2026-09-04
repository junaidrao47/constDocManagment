import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `users.tokens_valid_from`, the cut-off that makes issued JWTs revocable.
 *
 * Access tokens are stateless: once signed they stay valid for their whole
 * lifetime, so changing a password or disabling an account could not previously
 * end a session that was already open. Recording the moment of the last
 * credential or status change lets `authenticate` and the refresh flow reject any
 * token minted before it, which is what turns "password reset" into "all sessions
 * ended" rather than "the next login uses a new password".
 *
 * Nullable with no backfill: NULL means no invalidation event has happened for
 * that user, so every existing token stays valid and nobody is logged out by the
 * deploy itself.
 */
export class AddSessionInvalidation1700000001000 implements MigrationInterface {
  name = "AddSessionInvalidation1700000001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "tokens_valid_from" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "tokens_valid_from"
    `);
  }
}
