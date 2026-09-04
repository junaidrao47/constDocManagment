import path from "path";
import { DataSource } from "typeorm";
import {
  DocumentEntity,
  DocumentStatusHistoryEntity,
  IndustryEntity,
  InvoiceEntity,
  LocationEntity,
  NotificationLogEntity,
  PackageEntity,
  PaymentEntity,
  QuotationEntity,
  QuotationItemEntity,
  RefreshTokenEntity,
  ServiceEntity,
  SubscriptionEntity,
  UserEntity,
  WorkerRangeEntity,
} from "../entities";
import { env } from "./env";

export const databaseConfig = {
  url: env.databaseUrl,
};

// Resolved relative to this file rather than the process CWD or NODE_ENV, so the
// same config works under ts-node (src/config -> src/migrations/*.ts) and under
// plain node (dist/config -> dist/migrations/*.js).
const migrationsGlob = path.join(__dirname, "..", "migrations", "*.{ts,js}");

export const AppDataSource = new DataSource({
  type: "postgres",
  url: env.databaseUrl,
  entities: [
    UserEntity,
    RefreshTokenEntity,
    ServiceEntity,
    PackageEntity,
    WorkerRangeEntity,
    LocationEntity,
    IndustryEntity,
    QuotationEntity,
    QuotationItemEntity,
    SubscriptionEntity,
    DocumentEntity,
    DocumentStatusHistoryEntity,
    InvoiceEntity,
    PaymentEntity,
    NotificationLogEntity,
  ],
  migrations: [migrationsGlob],
  synchronize: false,
  logging: env.nodeEnv !== "production",
  migrationsTableName: "typeorm_migrations",
});

export async function initializeDatabase(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    // Compose gates startup on a Postgres healthcheck, but a short retry keeps the
    // container from crash-looping if the socket is not accepting connections yet.
    const maxAttempts = 10;
    const retryDelayMs = 2_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await AppDataSource.initialize();
        break;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[database] connection attempt ${attempt}/${maxAttempts} failed: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  const executed = await AppDataSource.runMigrations();

  if (executed.length > 0) {
    console.log(`[database] applied ${executed.length} migration(s): ${executed.map((m) => m.name).join(", ")}`);
  }

  return AppDataSource;
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
