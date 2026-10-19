import { assignmentService } from "../src/modules/assignments/assignment.service";
import { UserRole } from "../src/modules/users/user.entity";
import { fakeDb, resetTestState, seedUser } from "./support/harness";

beforeEach(() => resetTestState());

/**
 * Service-level only. This task adds the table, entity and queries and
 * deliberately mounts no router, so there is no HTTP surface to drive.
 */
describe("assignmentService.assign", () => {
  it("creates an assignment that isAssigned then reports", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.assign@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.assign@test.com" });

    await assignmentService.assign({ agentId: agent.id, customerId: customer.id });

    expect(await assignmentService.isAssigned(agent.id, customer.id)).toBe(true);
    expect(fakeDb.assignments().all()).toHaveLength(1);
  });

  it("is idempotent: assigning the same pair twice updates rather than duplicating", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.twice@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.twice@test.com" });

    await assignmentService.assign({ agentId: agent.id, customerId: customer.id, note: "first" });
    await assignmentService.assign({ agentId: agent.id, customerId: customer.id, note: "second" });

    const rows = fakeDb.assignments().all();
    // A manager clicking assign twice is not an error, and the unique index would
    // otherwise turn the second click into a 500.
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("second");
  });

  it("allows one customer to have several agents", async () => {
    const first = await seedUser({ role: UserRole.Agent, email: "agent.m2m.1@test.com" });
    const second = await seedUser({ role: UserRole.Agent, email: "agent.m2m.2@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.m2m@test.com" });

    await assignmentService.assign({ agentId: first.id, customerId: customer.id });
    await assignmentService.assign({ agentId: second.id, customerId: customer.id });

    // The many-to-many decision, asserted explicitly: client question C6 is
    // unanswered, and this is the shape that can represent either answer.
    expect((await assignmentService.listForCustomer(customer.id)).sort()).toEqual([first.id, second.id].sort());
  });

  it("allows one agent to hold many customers", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.many@test.com" });
    const one = await seedUser({ role: UserRole.Customer, email: "cust.many.1@test.com" });
    const two = await seedUser({ role: UserRole.Customer, email: "cust.many.2@test.com" });

    await assignmentService.assign({ agentId: agent.id, customerId: one.id });
    await assignmentService.assign({ agentId: agent.id, customerId: two.id });

    expect((await assignmentService.listForAgent(agent.id)).sort()).toEqual([one.id, two.id].sort());
  });

  it("records who made the assignment", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.by@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.by@test.com" });
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.by@test.com" });

    const row = await assignmentService.assign({
      agentId: agent.id,
      customerId: customer.id,
      assignedBy: manager.id,
      note: "Took over the northern book",
    });

    expect(row).toMatchObject({ assignedBy: manager.id, note: "Took over the northern book" });
  });
});

describe("assignmentService.assign rejects ends that are not what they claim", () => {
  it("404s on an agent id that matches no user", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.noagent@test.com" });

    await expect(
      assignmentService.assign({ agentId: "11111111-1111-4111-8111-111111111111", customerId: customer.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s on a customer id that matches no user", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.nocust@test.com" });

    await expect(
      assignmentService.assign({ agentId: agent.id, customerId: "22222222-2222-4222-8222-222222222222" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("400s when the agent end is really a customer", async () => {
    const notAnAgent = await seedUser({ role: UserRole.Customer, email: "cust.asagent@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.realone@test.com" });

    await expect(
      assignmentService.assign({ agentId: notAnAgent.id, customerId: customer.id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("400s when the customer end is an admin", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.adminend@test.com" });
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.ascust@test.com" });

    await expect(
      assignmentService.assign({ agentId: agent.id, customerId: admin.id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("leaves no row behind when validation fails", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.norow@test.com" });

    await expect(
      assignmentService.assign({ agentId: "33333333-3333-4333-8333-333333333333", customerId: customer.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(fakeDb.assignments().all()).toHaveLength(0);
  });
});

describe("assignmentService.unassign", () => {
  it("removes the row and reports that it did", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.un@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.un@test.com" });
    await assignmentService.assign({ agentId: agent.id, customerId: customer.id });

    expect(await assignmentService.unassign(agent.id, customer.id)).toEqual({ deleted: true });
    expect(await assignmentService.isAssigned(agent.id, customer.id)).toBe(false);
  });

  it("reports deleted: false for a pair that was never assigned, without throwing", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.never@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.never@test.com" });

    // Unassigning something already unassigned is the state the caller asked for.
    expect(await assignmentService.unassign(agent.id, customer.id)).toEqual({ deleted: false });
  });

  it("removes only the named pair", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.onepair@test.com" });
    const keep = await seedUser({ role: UserRole.Customer, email: "cust.keep@test.com" });
    const drop = await seedUser({ role: UserRole.Customer, email: "cust.drop@test.com" });
    await assignmentService.assign({ agentId: agent.id, customerId: keep.id });
    await assignmentService.assign({ agentId: agent.id, customerId: drop.id });

    await assignmentService.unassign(agent.id, drop.id);

    expect(await assignmentService.listForAgent(agent.id)).toEqual([keep.id]);
  });
});

describe("assignment lookups do not leak across agents", () => {
  it("lists only the queried agent's customers", async () => {
    const mine = await seedUser({ role: UserRole.Agent, email: "agent.mine@test.com" });
    const theirs = await seedUser({ role: UserRole.Agent, email: "agent.theirs@test.com" });
    const myCustomer = await seedUser({ role: UserRole.Customer, email: "cust.mine.a@test.com" });
    const theirCustomer = await seedUser({ role: UserRole.Customer, email: "cust.theirs.a@test.com" });
    await assignmentService.assign({ agentId: mine.id, customerId: myCustomer.id });
    await assignmentService.assign({ agentId: theirs.id, customerId: theirCustomer.id });

    expect(await assignmentService.listForAgent(mine.id)).toEqual([myCustomer.id]);
    expect(await assignmentService.isAssigned(mine.id, theirCustomer.id)).toBe(false);
  });
});
