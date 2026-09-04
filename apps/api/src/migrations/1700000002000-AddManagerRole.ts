import { MigrationInterface, QueryRunner } from "typeorm";

export class AddManagerRole1700000002000 implements MigrationInterface {
  name = "AddManagerRole1700000002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."user_role_enum" ADD VALUE IF NOT EXISTS 'manager' AFTER 'agent'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing an enum value in place.
  }
}