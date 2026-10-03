import { NextFunction, Request, Response, Router } from "express";
import { validate, validateParams, validateQuery } from "../../middleware/validate";
import { HttpError } from "../../utils/http-error";
import { CreateUserSchema, UpdateUserSchema } from "../users/user.schema";
import { adminUserService, ListUsersQuery } from "./admin-user.service";
import { ListUsersQuerySchema, SetUserStatusSchema, UserIdParamSchema } from "./admin.schema";
import { AdminEmailSchema } from "./admin-email.schema";
import { sendEmail } from "../../utils/email";
import { quotationService } from "../quotations/quotation.service";
import { QuotationIdParamSchema, QuotationStatusSchema } from "../quotations/quotation.schema";
import { PackageIdParamSchema, PackageSchema } from "../packages/package.schema";
import { packageService } from "../packages/package.service";
import { adminPricingService } from "./admin-pricing.service";
import {
  IndustryCreateSchema,
  IndustryUpdateSchema,
  IsActiveQuerySchema,
  LocationCreateSchema,
  LocationUpdateSchema,
  PricingIdParamSchema,
  ServiceCreateSchema,
  ServiceUpdateSchema,
  SettingKeyParamSchema,
  SettingUpdateSchema,
  WorkerRangeCreateSchema,
  WorkerRangeUpdateSchema,
} from "./admin-pricing.schema";

/**
 * Admin surface. Mounted behind `authenticate` + `authorize(UserRole.Admin)` in
 * app.ts — managers no longer reach any of it, which is what the api-surface spec
 * describes and what the previous `authorize("admin", "manager")` broke.
 */
export const adminRouter = Router();

/** Wraps an async handler so a rejection reaches the error handler instead of hanging. */
function send<T>(handler: (req: Request) => Promise<T>, statusCode = 200) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req)
      .then((data) => res.status(statusCode).json({ success: true, data, message: "ok" }))
      .catch(next);
  };
}

/** `authenticate` guarantees this, but the type does not — so it is checked once here. */
function actorId(req: Request): string {
  if (!req.user) {
    throw new HttpError(401, "Unauthorized");
  }

  return req.user.id;
}

function parseIsActive(query: Record<string, unknown>): boolean | undefined {
  if (query.isActive === "true") return true;
  if (query.isActive === "false") return false;
  return undefined;
}

// ─── Users ───────────────────────────────────────────────────────────────────

adminRouter.get(
  "/users",
  validateQuery(ListUsersQuerySchema),
  send((req) => adminUserService.listUsers(req.query as unknown as ListUsersQuery)),
);

adminRouter.post(
  "/users",
  validate(CreateUserSchema),
  send((req) => adminUserService.createUser(req.body, actorId(req)), 201),
);

adminRouter.get(
  "/users/:id",
  validateParams(UserIdParamSchema),
  send((req) => adminUserService.getUser(req.params.id)),
);

adminRouter.patch(
  "/users/:id",
  validateParams(UserIdParamSchema),
  validate(UpdateUserSchema),
  send((req) => adminUserService.updateUser(req.params.id, req.body, actorId(req))),
);

adminRouter.patch(
  "/users/:id/status",
  validateParams(UserIdParamSchema),
  validate(SetUserStatusSchema),
  send((req) => adminUserService.setUserStatus(req.params.id, req.body.isActive, actorId(req))),
);

// ─── Notifications ───────────────────────────────────────────────────────────

adminRouter.post(
  "/notifications/email",
  validate(AdminEmailSchema),
  send(async (req) => sendEmail(req.body)),
);

// ─── Quotations ───────────────────────────────────────────────────────────────

adminRouter.get("/quotations", send((req) => quotationService.list({ id: actorId(req), role: req.user!.role })));
adminRouter.get("/quotations/:id", validateParams(QuotationIdParamSchema), send((req) => quotationService.get(req.params.id, { id: actorId(req), role: req.user!.role })));
adminRouter.patch("/quotations/:id/status", validateParams(QuotationIdParamSchema), validate(QuotationStatusSchema), send((req) => quotationService.transition(req.params.id, req.body.status, { id: actorId(req), role: req.user!.role }, req.body.note)));
adminRouter.get("/quotations/:id/history", validateParams(QuotationIdParamSchema), send((req) => quotationService.history(req.params.id, { id: actorId(req), role: req.user!.role })));

// ─── Packages ────────────────────────────────────────────────────────────────

adminRouter.get("/packages", send(() => packageService.list()));
adminRouter.get("/packages/:id", validateParams(PackageIdParamSchema), send((req) => packageService.get(req.params.id)));
adminRouter.post("/packages", validate(PackageSchema), send((req) => packageService.create(req.body), 201));
adminRouter.patch("/packages/:id", validateParams(PackageIdParamSchema), validate(PackageSchema), send((req) => packageService.update(req.params.id, req.body)));
adminRouter.delete("/packages/:id", validateParams(PackageIdParamSchema), send((req) => packageService.remove(req.params.id)));

// ─── Pricing: Services ───────────────────────────────────────────────────────

adminRouter.get(
  "/services",
  validateQuery(IsActiveQuerySchema),
  send((req) => adminPricingService.listServices(parseIsActive(req.query as Record<string, unknown>))),
);
adminRouter.post(
  "/services",
  validate(ServiceCreateSchema),
  send((req) => adminPricingService.createService(req.body), 201),
);
adminRouter.patch(
  "/services/:id",
  validateParams(PricingIdParamSchema),
  validate(ServiceUpdateSchema),
  send((req) => adminPricingService.updateService(req.params.id, req.body)),
);
adminRouter.delete(
  "/services/:id",
  validateParams(PricingIdParamSchema),
  send((req) => adminPricingService.deactivateService(req.params.id)),
);

// ─── Pricing: Industries ─────────────────────────────────────────────────────

adminRouter.get(
  "/industries",
  validateQuery(IsActiveQuerySchema),
  send((req) => adminPricingService.listIndustries(parseIsActive(req.query as Record<string, unknown>))),
);
adminRouter.post(
  "/industries",
  validate(IndustryCreateSchema),
  send((req) => adminPricingService.createIndustry(req.body), 201),
);
adminRouter.patch(
  "/industries/:id",
  validateParams(PricingIdParamSchema),
  validate(IndustryUpdateSchema),
  send((req) => adminPricingService.updateIndustry(req.params.id, req.body)),
);
adminRouter.delete(
  "/industries/:id",
  validateParams(PricingIdParamSchema),
  send((req) => adminPricingService.deactivateIndustry(req.params.id)),
);

// ─── Pricing: Worker Ranges ──────────────────────────────────────────────────

adminRouter.get(
  "/worker-ranges",
  validateQuery(IsActiveQuerySchema),
  send((req) => adminPricingService.listWorkerRanges(parseIsActive(req.query as Record<string, unknown>))),
);
adminRouter.post(
  "/worker-ranges",
  validate(WorkerRangeCreateSchema),
  send((req) => adminPricingService.createWorkerRange(req.body), 201),
);
adminRouter.patch(
  "/worker-ranges/:id",
  validateParams(PricingIdParamSchema),
  validate(WorkerRangeUpdateSchema),
  send((req) => adminPricingService.updateWorkerRange(req.params.id, req.body)),
);
adminRouter.delete(
  "/worker-ranges/:id",
  validateParams(PricingIdParamSchema),
  send((req) => adminPricingService.deactivateWorkerRange(req.params.id)),
);

// ─── Pricing: Locations ──────────────────────────────────────────────────────

adminRouter.get(
  "/locations",
  validateQuery(IsActiveQuerySchema),
  send((req) => adminPricingService.listLocations(parseIsActive(req.query as Record<string, unknown>))),
);
adminRouter.post(
  "/locations",
  validate(LocationCreateSchema),
  send((req) => adminPricingService.createLocation(req.body), 201),
);
adminRouter.patch(
  "/locations/:id",
  validateParams(PricingIdParamSchema),
  validate(LocationUpdateSchema),
  send((req) => adminPricingService.updateLocation(req.params.id, req.body)),
);
adminRouter.delete(
  "/locations/:id",
  validateParams(PricingIdParamSchema),
  send((req) => adminPricingService.deactivateLocation(req.params.id)),
);

// ─── Settings ────────────────────────────────────────────────────────────────

adminRouter.get("/settings", send(() => adminPricingService.listSettings()));
adminRouter.put(
  "/settings/:key",
  validateParams(SettingKeyParamSchema),
  (req, _res, next) => {
    req.body = { ...req.body, key: req.params.key };
    next();
  },
  validate(SettingUpdateSchema),
  send((req) => adminPricingService.updateSetting(req.params.key, req.body.value, actorId(req))),
);

// ─── Placeholders ───────────────────────────────────────────────────────────

/** Phase 4: review queue across all customers. */
adminRouter.get("/documents", (_req, res) => {
  res.json({ success: true, data: [], message: "not implemented" });
});

/** Phase 4: admin override of a document decision. */
adminRouter.patch("/documents/:id/status", (_req, res) => {
  res.json({ success: true, data: {}, message: "not implemented" });
});

/** Phase 5: subscription oversight. */
adminRouter.get("/subscriptions", (_req, res) => {
  res.json({ success: true, data: [], message: "not implemented" });
});

/** Phase 6: reporting. */
adminRouter.get("/analytics", (_req, res) => {
  res.json({ success: true, data: {}, message: "not implemented" });
});
