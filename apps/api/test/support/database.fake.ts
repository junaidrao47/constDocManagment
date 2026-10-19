import { DocumentStatusHistoryEntity } from "../../src/entities/document-status-history.entity";
import { RefreshTokenEntity } from "../../src/entities/refresh-token.entity";
import { NotificationLogEntity } from "../../src/entities/notification-log.entity";
import { DocumentEntity } from "../../src/modules/documents/document.entity";
import { UserEntity } from "../../src/modules/users/user.entity";
import { ServiceEntity } from "../../src/entities/service.entity";
import { WorkerRangeEntity } from "../../src/entities/worker-range.entity";
import { LocationEntity } from "../../src/entities/location.entity";
import { IndustryEntity } from "../../src/entities/industry.entity";
import { PackageEntity } from "../../src/modules/packages/package.entity";
import { QuotationEntity } from "../../src/modules/quotations/quotation.entity";
import { QuotationItemEntity } from "../../src/entities/quotation-item.entity";
import { AppSettingEntity } from "../../src/entities/app-setting.entity";
import { AgentCustomerAssignmentEntity } from "../../src/entities/agent-customer-assignment.entity";
import { FakeRepository } from "./fake-repository";

/**
 * Stands in for src/config/database.
 *
 * jest.config.js maps every request ending in `config/database` here, so no source
 * file knows it is being tested. Every service in the API fetches its repository
 * lazily inside the function that uses it and guards on `isInitialized`, which is
 * what makes a swap at this level possible at all.
 */

type AnyRepository = FakeRepository<Record<string, unknown>>;

const repositories = new Map<unknown, AnyRepository>();

function labelFor(target: unknown): string {
  return typeof target === "function" ? target.name : String(target);
}

/** Present only so the fake's export surface matches the module it replaces. */
export const databaseConfig = {
  url: "postgres://unused:unused@127.0.0.1:15432/unused",
  synchronize: false,
  logging: false,
};

export const AppDataSource = {
  isInitialized: true,

  getRepository(target: unknown): AnyRepository {
    const existing = repositories.get(target);

    if (existing) {
      return existing;
    }

    const created = new FakeRepository<Record<string, unknown>>(labelFor(target));
    if (target === DocumentStatusHistoryEntity) {
      // Mirrors TypeORM `relations: { changedByUser: true }` and hydrates the full
      // user row, secrets included. A service that forgets toPublicUser() then
      // fails its test rather than passing against a conveniently thin fake.
      created.defineRelation("changedByUser", (row) =>
        AppDataSource.getRepository(UserEntity).all().find((user) => user.id === row.changedBy),
      );
    }
    if (target === QuotationEntity) {
      // Mirrors TypeORM `relations: { customer: true }`: the full user row, secrets
      // included, exactly what a service would receive from Postgres.
      created.defineRelation("customer", (row) =>
        AppDataSource.getRepository(UserEntity).all().find((user) => user.id === row.customerId),
      );
    }
    repositories.set(target, created);
    return created;
  },

  async transaction<T>(work: (manager: any) => Promise<T>): Promise<T> {
    const manager = {
      find: async (target: unknown, options: unknown = {}) => AppDataSource.getRepository(target).find(options as any),
      query: async (...args: unknown[]) => AppDataSource.query(...args),
      save: async (target: unknown, input: unknown) => {
        const repo = AppDataSource.getRepository(target);
        return repo.save(input as any);
      },
      create: (target: unknown, partial: unknown = {}) => {
        const repo = AppDataSource.getRepository(target);
        return repo.create(partial as any);
      },
    };

    return work(manager);
  },

  // Accepts and ignores arguments: app.ts's health check calls query("SELECT 1").
  async query(..._parameters: unknown[]): Promise<unknown[]> {
    return [{ "?column?": 1 }];
  },

  // Returns void rather than the data source: an object literal whose method returns the
  // object being declared is a circular reference TypeScript refuses to infer a type
  // for. Nothing in the API uses the return value.
  async initialize(): Promise<void> {
    // Already "connected".
  },

  async destroy(): Promise<void> {
    // Nothing to close.
  },

  async runMigrations(): Promise<unknown[]> {
    return [];
  },
};

export async function initializeDatabase() {
  return AppDataSource;
}

export async function closeDatabase(): Promise<void> {
  // Nothing to close.
}

/** Typed accessors, so a test does not have to remember which class is the key. */
export const fakeDb = {
  users: () => AppDataSource.getRepository(UserEntity),
  refreshTokens: () => AppDataSource.getRepository(RefreshTokenEntity),
  documents: () => AppDataSource.getRepository(DocumentEntity),
  documentHistory: () => AppDataSource.getRepository(DocumentStatusHistoryEntity),
  services: () => AppDataSource.getRepository(ServiceEntity),
  workerRanges: () => AppDataSource.getRepository(WorkerRangeEntity),
  locations: () => AppDataSource.getRepository(LocationEntity),
  industries: () => AppDataSource.getRepository(IndustryEntity),
  packages: () => AppDataSource.getRepository(PackageEntity),
  notifications: () => AppDataSource.getRepository(NotificationLogEntity),
  quotations: () => AppDataSource.getRepository(QuotationEntity),
  quotationItems: () => AppDataSource.getRepository(QuotationItemEntity),
  appSettings: () => AppDataSource.getRepository(AppSettingEntity),
  assignments: () => AppDataSource.getRepository(AgentCustomerAssignmentEntity),
};

export function resetFakeDatabase(): void {
  for (const repository of repositories.values()) {
    repository.clear();
  }
}
