import { NextFunction, Request, Response } from "express";
import { AccountStatus, UserRole } from "../modules/users/user.entity";
import { AppError } from "../utils/http-error";

/**
 * Blocks a customer whose account is not yet approved (PROJECT-BRIEF §11.1).
 *
 * Acts only on the `customer` role — staff pass straight through, so this is safe
 * to mount on routers that serve both (documents, quotations). The status comes
 * from the session the `authenticate` middleware already resolved, so there is no
 * extra database read here.
 *
 * `allow` lists method+path pairs (relative to the router's mount point) that stay
 * reachable while pending, so a customer can still read their own record and
 * complete onboarding.
 */
export interface AccountStatusGateOptions {
  allow?: Array<{ method: string; path: string }>;
}

export function enforceAccountStatus(options: AccountStatusGateOptions = {}) {
  const allow = options.allow ?? [];

  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    // Only customers are gated; an unauthenticated request never reaches here
    // because `authenticate` runs first.
    if (!user || user.role !== UserRole.Customer) {
      next();
      return;
    }

    // Block only an explicitly pending/suspended account. Anything else — approved,
    // or an absent value that the NOT NULL column makes impossible in production —
    // passes, so the gate fails open only for a state that cannot actually occur.
    const blocking =
      user.accountStatus === AccountStatus.PendingApproval || user.accountStatus === AccountStatus.Suspended;
    if (!blocking) {
      next();
      return;
    }

    const exempt = allow.some(
      (entry) => entry.method.toUpperCase() === req.method && entry.path === req.path,
    );
    if (exempt) {
      next();
      return;
    }

    if (user.accountStatus === AccountStatus.Suspended) {
      next(new AppError("ACCOUNT_SUSPENDED", 403, "Your account has been suspended. Contact support."));
      return;
    }

    next(new AppError("ACCOUNT_PENDING", 403, "Your account is awaiting admin approval."));
  };
}
