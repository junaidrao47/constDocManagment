import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1700000000000 implements MigrationInterface {
  name = "InitialSchema1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE TYPE IF NOT EXISTS "public"."user_role_enum" AS ENUM ('customer', 'agent', 'manager', 'admin')`);
    await queryRunner.query(`CREATE TYPE IF NOT EXISTS "public"."document_status_enum" AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'expiring_soon', 'expired')`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(150),
        "phone" character varying(30),
        "email" character varying(150) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "role" "public"."user_role_enum" NOT NULL DEFAULT 'customer',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "services" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(150) NOT NULL,
        "description" text,
        "base_price" numeric(12,2) NOT NULL DEFAULT '0',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_services_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_services_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(150) NOT NULL,
        "type" character varying(50) NOT NULL,
        "price" numeric(12,2) NOT NULL DEFAULT '0',
        "duration_days" integer NOT NULL,
        CONSTRAINT "PK_packages_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_packages_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "worker_ranges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "min_workers" integer NOT NULL,
        "max_workers" integer,
        "base_price" numeric(12,2) NOT NULL DEFAULT '0',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_worker_ranges_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "state" character varying(100) NOT NULL,
        "city" character varying(100) NOT NULL,
        "multiplier" numeric(8,4) NOT NULL DEFAULT '1',
        "city_fee" numeric(12,2) NOT NULL DEFAULT '0',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_locations_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "industries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(150) NOT NULL,
        "description" text,
        CONSTRAINT "PK_industries_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_industries_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quotations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "customer_id" uuid NOT NULL,
        "industry_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "worker_count" integer NOT NULL,
        "total_price" numeric(12,2) NOT NULL,
        "status" character varying(50) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_quotations_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_quotations_customer_id" ON "quotations" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_quotations_industry_id" ON "quotations" ("industry_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_quotations_location_id" ON "quotations" ("location_id")`);
    await queryRunner.query(`ALTER TABLE "quotations" ADD CONSTRAINT "FK_quotations_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quotations" ADD CONSTRAINT "FK_quotations_industry" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quotations" ADD CONSTRAINT "FK_quotations_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quotation_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "quotation_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "price" numeric(12,2) NOT NULL DEFAULT '0',
        CONSTRAINT "PK_quotation_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_quotation_items_pair" UNIQUE ("quotation_id", "service_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_quotation_items_quotation_id" ON "quotation_items" ("quotation_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_quotation_items_service_id" ON "quotation_items" ("service_id")`);
    await queryRunner.query(`ALTER TABLE "quotation_items" ADD CONSTRAINT "FK_quotation_items_quotation" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quotation_items" ADD CONSTRAINT "FK_quotation_items_service" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "customer_id" uuid NOT NULL,
        "package_id" uuid NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" character varying(50) NOT NULL,
        CONSTRAINT "PK_subscriptions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_subscriptions_customer_id" ON "subscriptions" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_subscriptions_package_id" ON "subscriptions" ("package_id")`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_package" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "customer_id" uuid NOT NULL,
        "service_id" uuid,
        "file_name" character varying(255) NOT NULL,
        "s3_key" character varying(512) NOT NULL,
        "status" "public"."document_status_enum" NOT NULL DEFAULT 'pending',
        "expires_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_documents_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_customer_id" ON "documents" ("customer_id")`);
    await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_documents_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_documents_service" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "document_id" uuid NOT NULL,
        "from_status" "public"."document_status_enum",
        "to_status" "public"."document_status_enum" NOT NULL,
        "changed_by" uuid,
        "note" text,
        CONSTRAINT "PK_document_status_history_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_document_status_history_document_id" ON "document_status_history" ("document_id")`);
    await queryRunner.query(`ALTER TABLE "document_status_history" ADD CONSTRAINT "FK_document_status_history_document" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "document_status_history" ADD CONSTRAINT "FK_document_status_history_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "customer_id" uuid NOT NULL,
        "subscription_id" uuid,
        "amount" numeric(12,2) NOT NULL,
        "status" character varying(50) NOT NULL,
        "due_date" date NOT NULL,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_invoices_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invoices_customer_id" ON "invoices" ("customer_id")`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "invoice_id" uuid NOT NULL,
        "gateway_ref" character varying(255),
        "amount" numeric(12,2) NOT NULL,
        "status" character varying(50) NOT NULL,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payments_invoice_id" ON "payments" ("invoice_id")`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "type" character varying(100) NOT NULL,
        "channel" character varying(50) NOT NULL,
        "status" character varying(50) NOT NULL,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_notifications_log_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_log_user_id" ON "notifications_log" ("user_id")`);
    await queryRunner.query(`ALTER TABLE "notifications_log" ADD CONSTRAINT "FK_notifications_log_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "package_services" (
        "package_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        CONSTRAINT "PK_package_services" PRIMARY KEY ("package_id", "service_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_package_services_package_id" ON "package_services" ("package_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_package_services_service_id" ON "package_services" ("service_id")`);
    await queryRunner.query(`ALTER TABLE "package_services" ADD CONSTRAINT "FK_package_services_package" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "package_services" ADD CONSTRAINT "FK_package_services_service" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "package_services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotation_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "industries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "locations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "worker_ranges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."document_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_role_enum"`);
  }
}