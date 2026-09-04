import "reflect-metadata";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { authRouter } from "./modules/auth/auth.router";
import { customerRouter } from "./modules/customers/customer.router";
import { documentRouter } from "./modules/documents/document.router";
import { adminRouter } from "./modules/admin/admin.router";
import { quotationRouter } from "./modules/quotations/quotation.router";
import { pricingRouter } from "./modules/pricing/pricing.router";
import { packageRouter } from "./modules/packages/package.router";
import { userRouter } from "./modules/users/user.router";
import { authenticate } from "./middleware/authenticate";
import { authorize } from "./middleware/authorize";
import { errorHandler } from "./middleware/errorHandler";
import { AppDataSource } from "./config/database";
import { redisClient } from "./config/redis";
import { env } from "./config/env";
import { Request, Response } from "express";

const READINESS_TIMEOUT_MS = 2_000;

/** Rejects if `promise` has not settled within READINESS_TIMEOUT_MS. */
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} check timed out after ${READINESS_TIMEOUT_MS}ms`));
    }, READINESS_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createApp() {
  const app = express();

  // CORS_ORIGIN accepts a comma-separated list so several frontends (marketing
  // site, customer portal, admin portal) can share one API. config/env refuses to
  // boot in production unless this is set to something other than "*".
  const allowedOrigins = (env.corsOrigin ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowAnyOrigin = allowedOrigins.includes("*");

  const rateLimiter = rateLimit({
    windowMs: 60_000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(helmet());
  app.use(
    cors({
      origin: allowAnyOrigin ? true : allowedOrigins,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("combined"));
  app.use("/api", rateLimiter);

  app.use("/api/auth", authRouter);
  app.use("/api/users", authenticate, userRouter);
  app.use("/api/customers", authenticate, authorize("customer"), customerRouter);
  app.use("/api/documents", authenticate, documentRouter);
  app.use("/api/quotations", quotationRouter);
  app.use("/api/pricing", pricingRouter);
  app.use("/api/packages", packageRouter);
  app.use("/api/admin", authenticate, authorize("admin", "manager"), adminRouter);

  // Liveness: answers as long as the process can serve HTTP. Used by the Docker
  // healthcheck, so it deliberately does not touch Postgres or Redis — a brief
  // database blip should not cause the container to be killed and restarted.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ success: true, data: { status: "ok" }, message: "ok" });
  });

  // Readiness: reports whether dependencies are actually reachable.
  //
  // Both probes are bounded. ioredis is configured with `maxRetriesPerRequest:
  // null` because BullMQ requires it, which means a command issued while Redis is
  // down is queued indefinitely rather than rejected — without a timeout this
  // endpoint would hang forever in exactly the situation it exists to report on.
  app.get("/health/ready", async (_req: Request, res: Response) => {
    const checks = { database: false, redis: false };

    try {
      if (AppDataSource.isInitialized) {
        await withTimeout(AppDataSource.query("SELECT 1"), "database");
        checks.database = true;
      }
    } catch {
      checks.database = false;
    }

    try {
      const pong = await withTimeout(redisClient.ping(), "redis");
      checks.redis = pong === "PONG";
    } catch {
      checks.redis = false;
    }

    const ready = checks.database && checks.redis;
    res.status(ready ? 200 : 503).json({
      success: ready,
      data: { status: ready ? "ready" : "degraded", checks },
      message: ready ? "ok" : "one or more dependencies are unavailable",
    });
  });

  app.use(errorHandler);

  return app;
}
