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
  url: env.databaseUrl ?? "",
};

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
  migrations: ["src/migrations/*{.ts,.js}"],
  synchronize: false,
  logging: env.nodeEnv !== "production",
  migrationsTableName: "typeorm_migrations",
});

export async function initializeDatabase(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  await AppDataSource.runMigrations();
  return AppDataSource;
}
