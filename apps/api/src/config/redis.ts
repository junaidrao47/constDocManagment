import Redis from "ioredis";
import { env } from "./env";

export const redisConfig = {
  url: env.redisUrl ?? "",
};

export const redisClient = env.redisUrl
  ? new Redis(env.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    })
  : new Redis({
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });

export async function initializeRedis(): Promise<void> {
  if (redisClient.status === "wait" || redisClient.status === "end") {
    await redisClient.connect();
  }
}
