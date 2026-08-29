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
import { env } from "./config/env";
import { Request, Response } from "express";

export function createApp() {
  const app = express();
  const allowedOrigin = env.corsOrigin ?? "*";

  const rateLimiter = rateLimit({
    windowMs: 60_000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(helmet());
  app.use(cors({ origin: allowedOrigin === "*" ? true : allowedOrigin }));
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

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ success: true, data: { status: "ok" }, message: "ok" });
  });

  app.use(errorHandler);

  return app;
}
