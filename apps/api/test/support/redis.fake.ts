/**
 * Stands in for src/config/redis.
 *
 * An in-memory key/value store with millisecond expiry, covering exactly the command
 * surface the API uses: get, set with PX, del, ping, and a MULTI that supports the
 * atomic GET-then-DEL used to redeem a single-use password-reset token.
 *
 * Expiry is honoured, because "the reset link expires" is a property worth testing
 * rather than assuming.
 */

interface Entry {
  value: string;
  expiresAt: number | null;
}

/** The subset of a MULTI pipeline the API actually queues. */
interface FakeMulti {
  get(key: string): FakeMulti;
  set(key: string, value: string, ...args: unknown[]): FakeMulti;
  del(key: string): FakeMulti;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

class FakeRedis {
  status = "ready";

  private readonly store = new Map<string, Entry>();

  /** Test hook: advances nothing, but drops anything already past its expiry. */
  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<"OK"> {
    let expiresAt: number | null = null;

    for (let index = 0; index < args.length; index += 1) {
      const mode = String(args[index]).toUpperCase();

      if (mode === "PX") {
        expiresAt = Date.now() + Number(args[index + 1]);
        index += 1;
      } else if (mode === "EX") {
        expiresAt = Date.now() + Number(args[index + 1]) * 1000;
        index += 1;
      }
    }

    this.store.set(key, { value: String(value), expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;

    for (const key of keys.flat()) {
      if (this.store.delete(key)) {
        removed += 1;
      }
    }

    return removed;
  }

  async exists(key: string): Promise<number> {
    return this.live(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.live(key);

    if (!entry) {
      return -2;
    }

    return entry.expiresAt === null ? -1 : Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  async ping(): Promise<"PONG"> {
    return "PONG";
  }

  async connect(): Promise<void> {
    this.status = "ready";
  }

  async quit(): Promise<"OK"> {
    this.status = "end";
    return "OK";
  }

  on(): this {
    return this;
  }

  multi(): FakeMulti {
    const operations: Array<() => Promise<unknown>> = [];

    // Annotated rather than inferred: the methods return the object being defined, and
    // TypeScript will not infer a type that references its own initializer.
    const chain: FakeMulti = {
      get: (key: string) => {
        operations.push(() => this.get(key));
        return chain;
      },
      set: (key: string, value: string, ...args: unknown[]) => {
        operations.push(() => this.set(key, value, ...args));
        return chain;
      },
      del: (key: string) => {
        operations.push(() => this.del(key));
        return chain;
      },
      exec: async (): Promise<Array<[Error | null, unknown]>> => {
        const results: Array<[Error | null, unknown]> = [];

        for (const operation of operations) {
          results.push([null, await operation()]);
        }

        return results;
      },
    };

    return chain;
  }

  // ---- test helpers, not part of the ioredis surface ----

  keys(prefix: string): string[] {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix) && this.live(key));
  }

  /** Forces a key to look expired without waiting for the clock. */
  expireNow(key: string): void {
    const entry = this.store.get(key);

    if (entry) {
      entry.expiresAt = Date.now() - 1;
    }
  }

  reset(): void {
    this.store.clear();
    this.status = "ready";
  }
}

export const redisClient = new FakeRedis();

export const redisConfig = { url: "redis://127.0.0.1:16379" };

export async function initializeRedis(): Promise<void> {
  await redisClient.connect();
}

export async function closeRedis(): Promise<void> {
  await redisClient.quit();
}

export function resetFakeRedis(): void {
  redisClient.reset();
}
