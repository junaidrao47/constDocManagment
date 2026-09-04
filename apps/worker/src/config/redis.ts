import Redis from "ioredis";
import { env } from "./env";

/**
 * Shared Redis connection for BullMQ.
 *
 * `maxRetriesPerRequest: null` is mandatory for BullMQ blocking commands — with
 * the ioredis default, long `BRPOPLPUSH` waits are aborted and workers stall.
 */
export const redisConnection = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redisConnection.on("error", (error: Error) => {
  console.error(`[worker:redis] ${error.message}`);
});

export async function initializeRedis(): Promise<void> {
  if (redisConnection.status === "wait" || redisConnection.status === "end") {
    await redisConnection.connect();
  }

  await redisConnection.ping();
}

export async function closeRedis(): Promise<void> {
  if (redisConnection.status !== "end") {
    await redisConnection.quit();
  }
}
