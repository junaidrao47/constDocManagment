import { FindOptionsWhere, ILike, In } from "typeorm";
import { AppDataSource } from "../../config/database";
import { CustomerManagerAssignmentEntity } from "../../entities/customer-manager-assignment.entity";
import { CustomerProfileEntity } from "../customers/customer-profile.entity";
import { AppError, HttpError } from "../../utils/http-error";
import { logger } from "../../utils/logger";
import { assignmentService } from "../assignments/assignment.service";
import { invalidateAllSessions, invalidateSessionCache } from "../auth/session";
import { notifyAccountApproved } from "../notifications/notify.service";
import { AccountStatus, UserEntity, UserRole } from "../users/user.entity";
import type { ListCustomersQuery } from "./admin-customer.schema";

/**
 * Admin-facing customer lifecycle (PROJECT-BRIEF §11.1/§11.2): approve a pending
 * registration (which requires assigning a manager), suspend/reactivate, and
 * reassign the manager. All status changes refresh the session so the account-status
 * gate sees them within seconds.
 */

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function users() {
  return AppDataSource.getRepository(UserEntity);
}

function serializeCustomer(
  user: UserEntity,
  managerId: string | null,
  profile?: { persona: string | null; city: string | null } | null,
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    accountStatus: user.accountStatus,
    preferredLocale: user.preferredLocale,
    managerId,
    // persona/city come from the onboarding profile (customer_profiles), surfaced on
    // the list so the admin can scan them without opening each customer. Null until
    // the customer has completed that part of onboarding.
    persona: profile?.persona ?? null,
    city: profile?.city ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function requireCustomer(id: string): Promise<UserEntity> {
  const user = await users().findOne({ where: { id } });
  if (!user) throw new HttpError(404, "Customer not found");
  if (user.role !== UserRole.Customer) throw new HttpError(400, "User is not a customer");
  return user;
}

export const adminCustomerService = {
  async listCustomers(query: ListCustomersQuery) {
    assertDatabaseReady();

    const base: FindOptionsWhere<UserEntity> = { role: UserRole.Customer };
    if (query.status) base.accountStatus = query.status;

    const where: FindOptionsWhere<UserEntity>[] = query.search
      ? (["email", "name"] as const).map((field) => ({ ...base, [field]: ILike(`%${query.search}%`) }))
      : [base];

    const [rows, total] = await users().findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    // One query each for the page's manager assignments and onboarding profiles, so
    // the list stays free of N+1 lookups.
    const ids = rows.map((r) => r.id);
    const [assignments, profiles] = await Promise.all([
      ids.length
        ? AppDataSource.getRepository(CustomerManagerAssignmentEntity).find({ where: { customerId: In(ids) } })
        : Promise.resolve([]),
      ids.length
        ? AppDataSource.getRepository(CustomerProfileEntity).find({ where: { customerId: In(ids) } })
        : Promise.resolve([]),
    ]);
    const managerByCustomer = new Map(assignments.map((a) => [a.customerId, a.managerId]));
    const profileByCustomer = new Map(
      profiles.map((p) => [p.customerId, { persona: p.persona ?? null, city: p.city ?? null }]),
    );

    return {
      items: rows.map((user) =>
        serializeCustomer(user, managerByCustomer.get(user.id) ?? null, profileByCustomer.get(user.id) ?? null),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  /** Managers with their current assigned-customer count, for the approve/reassign pickers. */
  async listManagers(): Promise<Array<{ id: string; name: string | null; email: string; customerCount: number }>> {
    assertDatabaseReady();
    const rows: Array<{ id: string; name: string | null; email: string; customerCount: string | number }> =
      await AppDataSource.query(
        `SELECT u.id, u.name, u.email, COUNT(a.customer_id)::int AS "customerCount"
         FROM users u
         LEFT JOIN customer_manager_assignments a ON a.manager_id = u.id
         WHERE u.role = 'manager' AND u.is_active = true
         GROUP BY u.id, u.name, u.email
         ORDER BY u.name NULLS LAST, u.email`,
      );
    return rows.map((r) => ({ id: r.id, name: r.name ?? null, email: r.email, customerCount: Number(r.customerCount) }));
  },

  /** Approve a pending customer and assign their manager (the manager is required). */
  async approve(customerId: string, managerId: string | undefined, actorId: string) {
    assertDatabaseReady();
    const user = await requireCustomer(customerId);

    if (!managerId) throw new AppError("MANAGER_REQUIRED", 400, "A manager must be assigned when approving a customer");

    // Assign first: if the manager id is invalid this throws before the account flips
    // to approved, so we never leave an approved customer with no manager.
    await assignmentService.setManager({ customerId, managerId, actorId });

    user.accountStatus = AccountStatus.Approved;
    await users().save(user);
    await invalidateSessionCache(customerId);

    await notifyAccountApproved(customerId);
    logger.info(`[admin] user ${actorId} approved customer ${customerId} with manager ${managerId}`);

    return serializeCustomer(user, managerId);
  },

  async suspend(customerId: string, actorId: string) {
    assertDatabaseReady();
    const user = await requireCustomer(customerId);
    user.accountStatus = AccountStatus.Suspended;
    await users().save(user);
    // End live sessions, not just refresh the cache: a suspension must take hold now.
    await invalidateAllSessions(customerId);
    logger.info(`[admin] user ${actorId} suspended customer ${customerId}`);
    const managerId = await assignmentService.getManagerFor(customerId);
    return serializeCustomer(user, managerId);
  },

  async reactivate(customerId: string, actorId: string) {
    assertDatabaseReady();
    const user = await requireCustomer(customerId);
    user.accountStatus = AccountStatus.Approved;
    await users().save(user);
    await invalidateSessionCache(customerId);
    logger.info(`[admin] user ${actorId} reactivated customer ${customerId}`);
    const managerId = await assignmentService.getManagerFor(customerId);
    return serializeCustomer(user, managerId);
  },

  /** Reassign a customer to a different manager, recording the reason in the log. */
  async reassignManager(customerId: string, managerId: string, reason: string, actorId: string) {
    assertDatabaseReady();
    await requireCustomer(customerId);
    await assignmentService.reassignManager({ customerId, managerId, reason, actorId });
    logger.info(`[admin] user ${actorId} reassigned customer ${customerId} to manager ${managerId}`);
    return { customerId, managerId };
  },
};
