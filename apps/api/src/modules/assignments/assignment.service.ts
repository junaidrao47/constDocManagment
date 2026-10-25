import { AppDataSource } from "../../config/database";
import { AgentCustomerAssignmentEntity } from "../../entities/agent-customer-assignment.entity";
import { CustomerManagerAssignmentEntity } from "../../entities/customer-manager-assignment.entity";
import { CustomerManagerAssignmentLogEntity } from "../../entities/customer-manager-assignment-log.entity";
import { HttpError } from "../../utils/http-error";
import { UserEntity, UserRole } from "../users/user.entity";

const assignments = () => AppDataSource.getRepository(AgentCustomerAssignmentEntity);
const managerAssignments = () => AppDataSource.getRepository(CustomerManagerAssignmentEntity);
const managerAssignmentLog = () => AppDataSource.getRepository(CustomerManagerAssignmentLogEntity);
const users = () => AppDataSource.getRepository(UserEntity);

export interface SetManagerInput {
  customerId: string;
  managerId: string;
  /** The admin performing the change; recorded, never taken from the request body. */
  actorId?: string | null;
  note?: string | null;
  reason?: string | null;
}

export interface AssignInput {
  agentId: string;
  customerId: string;
  assignedBy?: string | null;
  note?: string | null;
}

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

/**
 * Loads a user and checks their role before they are used as one end of an
 * assignment. Without this, a typo in an id silently creates an assignment
 * pointing at an admin, or at a second agent in the customer column — rows that
 * read as valid and would quietly widen someone's visibility once the read helper
 * starts trusting this table.
 */
async function requireUserWithRole(id: string, role: UserRole, label: string): Promise<UserEntity> {
  const user = await users().findOne({ where: { id } });

  if (!user) {
    throw new HttpError(404, `${label} not found`);
  }

  if (user.role !== role) {
    throw new HttpError(400, `${label} must have the ${role} role`);
  }

  return user;
}

export const assignmentService = {
  /**
   * Assigns `customerId` to `agentId`.
   *
   * Idempotent: re-assigning an existing pair updates the note and the assigner
   * rather than throwing or creating a duplicate. A manager clicking assign twice
   * is not an error, and the unique index would turn the second click into a 500.
   */
  async assign(input: AssignInput): Promise<AgentCustomerAssignmentEntity> {
    assertDatabaseReady();

    await requireUserWithRole(input.agentId, UserRole.Agent, "Agent");
    await requireUserWithRole(input.customerId, UserRole.Customer, "Customer");

    const existing = await assignments().findOne({
      where: { agentId: input.agentId, customerId: input.customerId },
    });

    if (existing) {
      existing.assignedBy = input.assignedBy ?? existing.assignedBy ?? null;
      existing.note = input.note ?? existing.note ?? null;
      return assignments().save(existing);
    }

    return assignments().save(
      assignments().create({
        agentId: input.agentId,
        customerId: input.customerId,
        assignedBy: input.assignedBy ?? null,
        note: input.note ?? null,
      }),
    );
  },

  /**
   * Removes an assignment. Reports whether a row went, and never throws on a pair
   * that was not assigned — unassigning something already unassigned is the state
   * the caller asked for.
   */
  async unassign(agentId: string, customerId: string): Promise<{ deleted: boolean }> {
    assertDatabaseReady();

    const existing = await assignments().findOne({ where: { agentId, customerId } });

    if (!existing) {
      return { deleted: false };
    }

    await assignments().delete({ agentId, customerId });
    return { deleted: true };
  },

  /**
   * Removes one assignment by its own id, for `DELETE /api/manager/assignments/:id`.
   *
   * Unlike `unassign`, a missing row is a 404 here: the caller named a specific
   * record, so answering "fine" would hide a stale id in a UI.
   */
  async removeById(id: string): Promise<{ id: string; deleted: true }> {
    assertDatabaseReady();

    const existing = await assignments().findOne({ where: { id } });

    if (!existing) {
      throw new HttpError(404, "Assignment not found");
    }

    await assignments().delete({ id });
    return { id, deleted: true };
  },

  /** Assignments, newest first, optionally narrowed to one agent or customer. */
  async list(query: { agentId?: string; customerId?: string; page: number; pageSize: number }) {
    assertDatabaseReady();

    const where = {
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };
    const [rows, total] = await assignments().findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      data: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },

  /** The customer ids assigned to `agentId`. */
  async listForAgent(agentId: string): Promise<string[]> {
    assertDatabaseReady();

    const rows = await assignments().find({ where: { agentId }, order: { createdAt: "ASC" } });
    return rows.map((row) => row.customerId);
  },

  /** The agent ids responsible for `customerId`. */
  async listForCustomer(customerId: string): Promise<string[]> {
    assertDatabaseReady();

    const rows = await assignments().find({ where: { customerId }, order: { createdAt: "ASC" } });
    return rows.map((row) => row.agentId);
  },

  /**
   * Whether `agentId` is responsible for `customerId`.
   *
   * This is the function the follow-up scoping change calls from
   * `assertCanReadDocument` in `modules/documents/document.service.ts`, to replace
   * the `TODO(phase-4)` early return that currently lets any staff member read any
   * customer's documents. Nothing calls it yet: this task adds the data and the
   * query, and deliberately does not change who can see what.
   */
  async isAssigned(agentId: string, customerId: string): Promise<boolean> {
    assertDatabaseReady();

    const count = await assignments().count({ where: { agentId, customerId } });
    return count > 0;
  },

  // ── Manager assignment (PROJECT-BRIEF §11.2) ───────────────────────────────────
  //
  // One manager per customer at a time (unique index on customer_id). Every change
  // writes a log row so reassignment history survives. These live here so "assign a
  // staff member to a customer" stays one module, even though the data model differs
  // from the many-to-many agent table above.

  /**
   * Sets (or replaces) the customer's manager and records the change in the log.
   * Idempotent for the same manager: it refreshes the note/reason without a
   * duplicate log row unless the manager actually changed.
   */
  async setManager(input: SetManagerInput): Promise<CustomerManagerAssignmentEntity> {
    assertDatabaseReady();

    await requireUserWithRole(input.customerId, UserRole.Customer, "Customer");
    await requireUserWithRole(input.managerId, UserRole.Manager, "Manager");

    const existing = await managerAssignments().findOne({ where: { customerId: input.customerId } });
    const previousManagerId = existing?.managerId ?? null;
    const managerChanged = previousManagerId !== input.managerId;

    const saved = await AppDataSource.transaction(async (manager) => {
      const row = existing ?? managerAssignments().create({ customerId: input.customerId });
      row.managerId = input.managerId;
      row.assignedBy = input.actorId ?? row.assignedBy ?? null;
      row.note = input.note ?? row.note ?? null;
      const persisted = await manager.save(CustomerManagerAssignmentEntity, row);

      if (managerChanged) {
        await manager.save(CustomerManagerAssignmentLogEntity, {
          customerId: input.customerId,
          fromManagerId: previousManagerId,
          toManagerId: input.managerId,
          changedBy: input.actorId ?? null,
          reason: input.reason ?? input.note ?? null,
        });
      }

      return persisted;
    });

    return saved;
  },

  /** Reassigns a customer to a different manager; `reason` is required at the route. */
  async reassignManager(input: SetManagerInput): Promise<CustomerManagerAssignmentEntity> {
    return this.setManager(input);
  },

  /** The manager id responsible for a customer, or null when none is assigned. */
  async getManagerFor(customerId: string): Promise<string | null> {
    assertDatabaseReady();
    const row = await managerAssignments().findOne({ where: { customerId } });
    return row?.managerId ?? null;
  },

  /** Whether `managerId` is the customer's assigned manager. */
  async isManagerFor(managerId: string, customerId: string): Promise<boolean> {
    assertDatabaseReady();
    const count = await managerAssignments().count({ where: { managerId, customerId } });
    return count > 0;
  },

  /** The customer ids a manager is responsible for. */
  async listCustomersForManager(managerId: string): Promise<string[]> {
    assertDatabaseReady();
    const rows = await managerAssignments().find({ where: { managerId }, order: { createdAt: "ASC" } });
    return rows.map((row) => row.customerId);
  },

  /** The reassignment history for a customer, newest first. */
  async managerHistory(customerId: string): Promise<CustomerManagerAssignmentLogEntity[]> {
    assertDatabaseReady();
    return managerAssignmentLog().find({ where: { customerId }, order: { createdAt: "DESC" } });
  },

  /**
   * The customer-id filter a staff actor's list queries must apply, or `null` when
   * the actor is unrestricted.
   *
   * **This is the single helper both `/api/agent/documents` and
   * `/api/agent/quotations` scope through**, so "what an agent may list" is decided
   * in one place and cannot drift between the two.
   *
   * An empty array is meaningful and distinct from `null`: it is an agent with no
   * customers, who must see nothing. Callers have to branch on that before building
   * an `In([])`, which Postgres rejects.
   *
   * Agents and managers are both scoped to their assignments; admin returns `null` (all).
   *
   * Managers were `null` (all) under the 2026-10-14 decision, taken before any manager↔customer
   * link existed. The 2026-10-24 decisions (PROJECT-BRIEF §11.2) added `customer_manager_assignments`
   * and a "My customers" workspace, so a manager now narrows to their assigned customers — which
   * also keeps the "My Documents Queue" consistent with what a manager may actually act on
   * (phase/status changes require `isManagerFor`, so an unscoped queue showed docs that 403'd).
   */
  async customerScopeFor(actor: { id: string; role: UserRole }): Promise<string[] | null> {
    if (actor.role === UserRole.Agent) {
      return this.listForAgent(actor.id);
    }
    if (actor.role === UserRole.Manager) {
      return this.listCustomersForManager(actor.id);
    }

    return null;
  },
};
