import { DataSource } from "typeorm";
import { env } from "./env";

/**
 * Worker data source.
 *
 * Entities live in the API app, which is a separate build context, so the worker
 * connects without an entity list and uses the query builder / raw SQL for the
 * read-mostly work its jobs need. Schema ownership stays with the API's
 * migrations — the worker never mutates schema.
 */
export const AppDataSource = new DataSource({
  type: "postgres",
  url: env.databaseUrl,
  entities: [],
  migrations: [],
  synchronize: false,
  logging: false,
});

export async function initializeDatabase(): Promise<DataSource> {
  if (AppDataSource.isInitialized) {
    return AppDataSource;
  }

  const maxAttempts = 10;
  const retryDelayMs = 2_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await AppDataSource.initialize();
      return AppDataSource;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[worker:database] connection attempt ${attempt}/${maxAttempts} failed: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return AppDataSource;
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
