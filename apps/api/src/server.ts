import "reflect-metadata";
import type { Server } from "http";
import { createApp } from "./app";
import { closeDatabase, initializeDatabase } from "./config/database";
import { closeRedis, initializeRedis } from "./config/redis";
import { env } from "./config/env";
import { ensureLocalDocumentStorage } from "./utils/s3";

export async function startServer(): Promise<Server> {
  await initializeDatabase();
  await initializeRedis();
  await ensureLocalDocumentStorage();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] listening on port ${env.port} in ${env.nodeEnv} mode`);
  });

  registerShutdownHandlers(server);
  return server;
}

/**
 * Docker sends SIGTERM on `docker compose down` / `stop`. Without these handlers
 * the process is killed after the 10s grace period, dropping in-flight requests
 * and leaving Postgres connections to time out server-side.
 */
function registerShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`[api] received ${signal}, shutting down`);

    const forceExit = setTimeout(() => {
      console.error("[api] shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

      await closeRedis();
      await closeDatabase();
      clearTimeout(forceExit);
      console.log("[api] shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[api] error during shutdown", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("[api] failed to start", error);
    process.exit(1);
  });
}
