import type { NextFunction, Request, Response } from "express";
import { AppDataSource } from "../src/config/database";
import { enforceAccountStatus } from "../src/middleware/account-status";
import { CustomerProfileEntity } from "../src/modules/customers/customer-profile.entity";
import { notifyPhase } from "../src/modules/notifications/notify.service";
import {
  assertPhaseStatusTransition,
  canTransitionPhase,
  PhaseStatus,
} from "../src/modules/documents/phase-status";
import { AccountStatus, UserEntity, UserLocale, UserRole } from "../src/modules/users/user.entity";
import { AppError } from "../src/utils/http-error";
import { queuedEmails, resetQueuedEmails } from "./support/email-queue.fake";

describe("phase status transitions", () => {
  it("allows manager moves through the flow", () => {
    expect(canTransitionPhase(PhaseStatus.NotStarted, PhaseStatus.InProgress)).toBe(true);
    expect(canTransitionPhase(PhaseStatus.InProgress, PhaseStatus.Completed)).toBe(true);
    expect(canTransitionPhase(PhaseStatus.Rejected, PhaseStatus.InProgress)).toBe(true);
    expect(() => assertPhaseStatusTransition(PhaseStatus.InProgress, PhaseStatus.Completed)).not.toThrow();
  });

  it("rejects an impossible move with PHASE_INVALID_TRANSITION (409)", () => {
    expect(canTransitionPhase(PhaseStatus.Completed, PhaseStatus.Rejected)).toBe(false);
    try {
      assertPhaseStatusTransition(PhaseStatus.Completed, PhaseStatus.Rejected);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("PHASE_INVALID_TRANSITION");
      expect((error as AppError).httpStatus).toBe(409);
    }
  });
});

describe("notifyPhase", () => {
  beforeEach(() => resetQueuedEmails());

  it("emails every onboarding address in the customer's locale, with the localized phase name", async () => {
    const customerId = "cust-phase-1";
    await AppDataSource.getRepository(UserEntity).save({
      id: customerId,
      email: "login@example.test",
      name: "Acme",
      role: UserRole.Customer,
      accountStatus: AccountStatus.Approved,
      preferredLocale: UserLocale.En,
    } as UserEntity);
    await AppDataSource.getRepository(CustomerProfileEntity).save({
      customerId,
      notificationEmails: ["ops@acme.test", "legal@acme.test"],
    } as unknown as CustomerProfileEntity);

    await notifyPhase({
      customerId,
      type: "phase_completed",
      data: { documentName: "Permit", phaseNameEn: "Municipal review", phaseNameEs: "Revisión municipal", progressPercent: 33 },
    });

    expect(queuedEmails).toHaveLength(2);
    expect(queuedEmails.map((e) => e.to).sort()).toEqual(["legal@acme.test", "ops@acme.test"]);
    for (const email of queuedEmails) {
      expect(email.templateName).toBe("phase-completed");
      expect(email.locale).toBe("en");
      expect(email.data).toMatchObject({ phaseName: "Municipal review", progressPercent: 33 });
    }
  });

  it("falls back to the login email when no onboarding addresses exist", async () => {
    const customerId = "cust-phase-2";
    await AppDataSource.getRepository(UserEntity).save({
      id: customerId,
      email: "solo@example.test",
      role: UserRole.Customer,
      accountStatus: AccountStatus.Approved,
      preferredLocale: UserLocale.EsMX,
    } as UserEntity);

    await notifyPhase({ customerId, type: "phase_rejected", data: { documentName: "Permit", phaseNameEn: "X", phaseNameEs: "X" } });

    expect(queuedEmails).toHaveLength(1);
    expect(queuedEmails[0]).toMatchObject({ to: "solo@example.test", templateName: "phase-rejected", locale: "es-MX" });
  });
});

describe("enforceAccountStatus gate", () => {
  function run(user: { role: UserRole; accountStatus: AccountStatus } | undefined, method = "GET", path = "/me/documents", allow: Array<{ method: string; path: string }> = []) {
    const next = jest.fn() as unknown as NextFunction;
    const req = { user, method, path } as unknown as Request;
    enforceAccountStatus({ allow })(req, {} as Response, next);
    return next as unknown as jest.Mock;
  }

  it("blocks a pending customer with ACCOUNT_PENDING", () => {
    const next = run({ role: UserRole.Customer, accountStatus: AccountStatus.PendingApproval });
    const error = next.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("ACCOUNT_PENDING");
  });

  it("blocks a suspended customer with ACCOUNT_SUSPENDED", () => {
    const next = run({ role: UserRole.Customer, accountStatus: AccountStatus.Suspended });
    expect((next.mock.calls[0][0] as AppError).code).toBe("ACCOUNT_SUSPENDED");
  });

  it("lets an approved customer through", () => {
    const next = run({ role: UserRole.Customer, accountStatus: AccountStatus.Approved });
    expect(next).toHaveBeenCalledWith();
  });

  it("lets staff through regardless of status field", () => {
    const next = run({ role: UserRole.Manager, accountStatus: AccountStatus.PendingApproval });
    expect(next).toHaveBeenCalledWith();
  });

  it("exempts an allowlisted path for a pending customer", () => {
    const next = run(
      { role: UserRole.Customer, accountStatus: AccountStatus.PendingApproval },
      "GET",
      "/me/onboarding",
      [{ method: "GET", path: "/me/onboarding" }],
    );
    expect(next).toHaveBeenCalledWith();
  });
});
