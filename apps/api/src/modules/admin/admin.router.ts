import { NextFunction, Request, Response, Router } from "express";
import { validate, validateParams, validateQuery } from "../../middleware/validate";
import { HttpError } from "../../utils/http-error";
import { CreateUserSchema, UpdateUserSchema } from "../users/user.schema";
import { adminUserService, ListUsersQuery } from "./admin-user.service";
import { ListUsersQuerySchema, SetUserStatusSchema, UserIdParamSchema } from "./admin.schema";

/**
 * Admin surface. Mounted behind `authenticate` + `authorize(UserRole.Admin)` in
 * app.ts — managers no longer reach any of it, which is what the api-surface spec
 * describes and what the previous `authorize("admin", "manager")` broke.
 *
 * The user routes below are real. The remaining handlers are still the placeholders
 * they were, kept so the paths do not disappear from the contract, and each is
 * marked with the phase that fills it in.
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

// --- Placeholders -----------------------------------------------------------
// Still hardcoded. Left in place so the URL contract is visible, but they return
// empty shapes and touch no database — do not treat a 200 here as a working
// feature. Phase noted against each.

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

/** Phase 3: pricing configuration. */
adminRouter.post("/pricing/worker-ranges", (_req, res) => {
  res.json({ success: true, data: {}, message: "not implemented" });
});

/** Phase 3: pricing configuration. */
adminRouter.post("/pricing/locations", (_req, res) => {
  res.json({ success: true, data: {}, message: "not implemented" });
});

/** Phase 6: reporting. */
adminRouter.get("/analytics", (_req, res) => {
  res.json({ success: true, data: {}, message: "not implemented" });
});
