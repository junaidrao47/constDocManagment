import { DocumentStatusHistoryEntity } from "../../src/entities/document-status-history.entity";
import { RefreshTokenEntity } from "../../src/entities/refresh-token.entity";
import { DocumentEntity } from "../../src/modules/documents/document.entity";
import { UserEntity } from "../../src/modules/users/user.entity";
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
    repositories.set(target, created);
    return created;
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
};

export function resetFakeDatabase(): void {
  for (const repository of repositories.values()) {
    repository.clear();
  }
}
