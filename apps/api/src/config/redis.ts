import Redis from "ioredis";
import { env } from "./env";

export const redisConfig = {
  url: env.redisUrl,
};

// REDIS_URL is validated as required in config/env, so there is no
// implicit-localhost fallback here: connection targets stay explicit.
export const redisClient = new Redis(env.redisUrl, {
  lazyConnect: true,
  // Required by BullMQ, and keeps commands from failing during a brief restart.
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redisClient.on("error", (error: Error) => {
  console.error(`[redis] ${error.message}`);
});

export async function initializeRedis(): Promise<void> {
  if (redisClient.status === "wait" || redisClient.status === "end") {
    await redisClient.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient.status !== "end") {
    await redisClient.quit();
  }
}
