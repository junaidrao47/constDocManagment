import { AppDataSource } from "../../config/database";
import { AgentCustomerAssignmentEntity } from "../../entities/agent-customer-assignment.entity";
import { HttpError } from "../../utils/http-error";
import { UserEntity, UserRole } from "../users/user.entity";

const assignments = () => AppDataSource.getRepository(AgentCustomerAssignmentEntity);
const users = () => AppDataSource.getRepository(UserEntity);

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
   * Manager and admin return `null` by the decision of 2026-10-14: there is no team
   * concept anywhere in the schema to narrow a manager against, so narrowing them
   * would have meant inventing one.
   */
  async customerScopeFor(actor: { id: string; role: UserRole }): Promise<string[] | null> {
    if (actor.role === UserRole.Agent) {
      return this.listForAgent(actor.id);
    }

    return null;
  },
};
