import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validate, validateParams, validateQuery } from "../../middleware/validate";
import { HttpError } from "../../utils/http-error";
import { assignmentService } from "../assignments/assignment.service";
import {
  AssignmentCreateSchema,
  AssignmentIdParamSchema,
  AssignmentListQuerySchema,
  type AssignmentListQuery,
} from "../assignments/assignment.schema";
import { managerService } from "./manager.service";
import { UserRole } from "../users/user.entity";

const CustomerIdParamSchema = z.object({ id: z.string().uuid("must be a valid customer id") });

/**
 * Manager oversight, split out of `/api/admin` so managers stop inheriting the
 * whole admin surface — user management, pricing configuration, analytics.
 *
 * Mounted for manager **and** admin. The RBAC matrix in `docs/api-surface.md`
 * gives both a tick on "Assign customer to agent", and locking the admin out would
 * leave a bad assignment fixable only with a database client.
 *
 * Role validation for the two ends of an assignment lives in the service, not here:
 * it needs a database read, and a route is the wrong place to own that rule.
 */
export const managerRouter = Router();

/** Wraps an async handler so a rejection reaches the error handler instead of hanging. */
function send<T>(handler: (req: Request) => Promise<T>, statusCode = 200) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req)
      .then((data) => res.status(statusCode).json({ success: true, data, message: "ok" }))
      .catch(next);
  };
}

/** `authenticate` guarantees this; the type does not, so it is checked once here. */
function actorId(req: Request): string {
  if (!req.user) {
    throw new HttpError(401, "Unauthorized");
  }

  return req.user.id;
}

function actor(req: Request): { id: string; role: UserRole } {
  if (!req.user) {
    throw new HttpError(401, "Unauthorized");
  }
  return { id: req.user.id, role: req.user.role };
}

// ── Workspace: my customers (PROJECT-BRIEF §11.8) ───────────────────────────────
managerRouter.get(
  "/customers",
  send((req) => managerService.listCustomers(actor(req))),
);

managerRouter.get(
  "/customers/:id",
  validateParams(CustomerIdParamSchema),
  send((req) => managerService.getCustomer(actor(req), req.params.id)),
);

managerRouter.get(
  "/assignments",
  validateQuery(AssignmentListQuerySchema),
  send((req) => assignmentService.list(req.query as unknown as AssignmentListQuery)),
);

managerRouter.post(
  "/assignments",
  validate(AssignmentCreateSchema),
  send(
    (req) =>
      assignmentService.assign({
        agentId: req.body.agentId,
        customerId: req.body.customerId,
        note: req.body.note ?? null,
        // Recorded from the token, never accepted from the body: who assigned whom
        // is audit data and a client must not be able to claim someone else did it.
        assignedBy: actorId(req),
      }),
    201,
  ),
);

managerRouter.delete(
  "/assignments/:id",
  validateParams(AssignmentIdParamSchema),
  send((req) => assignmentService.removeById(req.params.id)),
);
