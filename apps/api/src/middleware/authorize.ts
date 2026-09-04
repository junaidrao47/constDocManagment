import { NextFunction, Request, Response } from "express";
import { UserRole } from "../modules/users/user.entity";

/**
 * Role gate for a route.
 *
 * Typed against `UserRole` rather than `string`, because the untyped version had a
 * silent failure mode: `authorize("Admin")` or `authorize("staff")` compiled fine
 * and then denied everyone, since no user's role ever equals those strings. A
 * typo in a role name is now a build error instead of a route nobody can reach.
 *
 * Must run after `authenticate`, which resolves the role from the database rather
 * than from the token — so a demotion is honoured here, not fifteen minutes later.
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;

    if (!role || !roles.includes(role)) {
      res.status(403).json({ success: false, error: "Forbidden" });
      return;
    }

    next();
  };
}

/**
 * Everyone who works for the business, as opposed to a customer.
 *
 * Named rather than spelled out at each call site so that widening or narrowing
 * "staff" is one edit, and so a route cannot accidentally list a subset.
 */
export const STAFF_ROLES: UserRole[] = [UserRole.Agent, UserRole.Manager, UserRole.Admin];
