import "reflect-metadata";
import { closeDatabase, initializeDatabase } from "./config/database";
import { closeRedis, initializeRedis } from "./config/redis";
import { env } from "./config/env";

/**
 * Worker entry point.
 *
 * Responsibilities today: validate configuration, prove Postgres and Redis are
 * reachable, then stay alive and shut down cleanly. Queue consumers and cron
 * schedules are registered from here once implemented — see the TODO stubs under
 * `src/queues`, `src/processors`, and `src/crons`.
 */

let shuttingDown = false;

export async function startWorker(): Promise<void> {
  await initializeDatabase();
  console.log("[worker] postgres connected");

  await initializeRedis();
  console.log("[worker] redis connected");

  // TODO: register BullMQ workers (email, document, renewal) and cron schedules.
  // Nothing is registered yet, so the process intentionally just idles below.

  console.log(`[worker] ready in ${env.nodeEnv} mode, waiting for jobs`);
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[worker] received ${signal}, shutting down`);

  const forceExit = setTimeout(() => {
    console.error("[worker] shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    // TODO: close BullMQ workers here first so in-flight jobs finish or are
    // returned to the queue before the connections they depend on are torn down.
    await closeRedis();
    await closeDatabase();
    clearTimeout(forceExit);
    console.log("[worker] shutdown complete");
    process.exit(exitCode);
  } catch (error) {
    console.error("[worker] error during shutdown", error);
    process.exit(1);
  }
}

if (require.main === module) {
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("[worker] unhandled rejection", reason);
    void shutdown("unhandledRejection", 1);
  });

  process.on("uncaughtException", (error) => {
    console.error("[worker] uncaught exception", error);
    void shutdown("uncaughtException", 1);
  });

  startWorker()
    // Keep the event loop alive even though no consumers are registered yet.
    // Without this the process would exit 0 immediately and Compose would
    // report the container as stopped rather than running.
    .then(() => setInterval(() => undefined, 60_000))
    .catch((error) => {
      console.error("[worker] failed to start", error);
      process.exit(1);
    });
}
