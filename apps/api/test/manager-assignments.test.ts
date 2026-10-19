import request from "supertest";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedAssignment, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

const UNKNOWN_UUID = "99999999-9999-4999-8999-999999999999";

describe("POST /api/manager/assignments", () => {
  it("creates an assignment and records the caller as the assigner", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.create@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.create@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.create@test.com" });

    const response = await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", bearer(mintToken(manager)))
      .send({ agentId: agent.id, customerId: customer.id, note: "Northern book" });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      agentId: agent.id,
      customerId: customer.id,
      note: "Northern book",
      // Taken from the token, never the body: who assigned whom is audit data.
      assignedBy: manager.id,
    });
  });

  it("is idempotent on the same pair", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.idem@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.idem@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.idem@test.com" });
    const body = { agentId: agent.id, customerId: customer.id };
    const token = bearer(mintToken(manager));

    await request(testApp()).post("/api/manager/assignments").set("Authorization", token).send(body).expect(201);
    await request(testApp()).post("/api/manager/assignments").set("Authorization", token).send(body).expect(201);

    // The unique index would turn a second click into a 500 without this.
    expect(fakeDb.assignments().all()).toHaveLength(1);
  });

  it("404s an agent or customer id that matches no user", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.404@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.404@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.404@test.com" });
    const token = bearer(mintToken(manager));

    await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", token)
      .send({ agentId: UNKNOWN_UUID, customerId: customer.id })
      .expect(404);

    await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", token)
      .send({ agentId: agent.id, customerId: UNKNOWN_UUID })
      .expect(404);
  });

  it("400s when either end has the wrong role", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.role@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.role@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.role@test.com" });
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.role@test.com" });
    const token = bearer(mintToken(manager));

    // A customer in the agent column, or an admin in the customer column, would be
    // a row that reads as valid and silently widens someone's visibility.
    await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", token)
      .send({ agentId: customer.id, customerId: customer.id })
      .expect(400);

    await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", token)
      .send({ agentId: agent.id, customerId: admin.id })
      .expect(400);
  });

  it("400s a non-uuid id before it reaches a repository", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.uuid@test.com" });

    await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", bearer(mintToken(manager)))
      .send({ agentId: "not-a-uuid", customerId: "also-not" })
      .expect(400);
  });
});

describe("GET /api/manager/assignments", () => {
  it("returns data plus pagination, and filters by agentId", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.list@test.com" });
    const first = await seedUser({ role: UserRole.Agent, email: "agent.list.1@test.com" });
    const second = await seedUser({ role: UserRole.Agent, email: "agent.list.2@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.list@test.com" });
    seedAssignment(first.id, customer.id);
    seedAssignment(second.id, customer.id);
    const token = bearer(mintToken(manager));

    const all = await request(testApp()).get("/api/manager/assignments").set("Authorization", token);
    expect(all.status).toBe(200);
    // Paginated from day one: nothing consumes this endpoint yet, so there is no
    // bare-array contract to preserve.
    expect(all.body.data.pagination).toMatchObject({ page: 1, total: 2, totalPages: 1 });

    const filtered = await request(testApp())
      .get(`/api/manager/assignments?agentId=${first.id}`)
      .set("Authorization", token);
    expect(filtered.body.data.data).toHaveLength(1);
    expect(filtered.body.data.data[0].agentId).toBe(first.id);
  });
});

describe("DELETE /api/manager/assignments/:id", () => {
  it("removes the named assignment", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.del@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.del@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.del@test.com" });
    const assignmentId = seedAssignment(agent.id, customer.id);

    const response = await request(testApp())
      .delete(`/api/manager/assignments/${assignmentId}`)
      .set("Authorization", bearer(mintToken(manager)));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: assignmentId, deleted: true });
    expect(fakeDb.assignments().all()).toHaveLength(0);
  });

  it("404s an id that does not exist", async () => {
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.del404@test.com" });

    // By id, unlike unassign(), a miss is a 404: answering "fine" would hide a
    // stale id in a UI.
    await request(testApp())
      .delete(`/api/manager/assignments/${UNKNOWN_UUID}`)
      .set("Authorization", bearer(mintToken(manager)))
      .expect(404);
  });
});

describe("who may reach /api/manager", () => {
  it("403s an agent on all three routes", async () => {
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.rbac@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.rbac@test.com" });
    const assignmentId = seedAssignment(agent.id, customer.id);
    const token = bearer(mintToken(agent));

    // An agent must not be able to widen their own book.
    await request(testApp()).get("/api/manager/assignments").set("Authorization", token).expect(403);
    await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", token)
      .send({ agentId: agent.id, customerId: customer.id })
      .expect(403);
    await request(testApp())
      .delete(`/api/manager/assignments/${assignmentId}`)
      .set("Authorization", token)
      .expect(403);
  });

  it("403s a customer", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.rbac2@test.com" });

    await request(testApp())
      .get("/api/manager/assignments")
      .set("Authorization", bearer(mintToken(customer)))
      .expect(403);
  });

  it("lets an admin through, per the RBAC matrix", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.rbac@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.rbac2@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.rbac3@test.com" });

    const created = await request(testApp())
      .post("/api/manager/assignments")
      .set("Authorization", bearer(mintToken(admin)))
      .send({ agentId: agent.id, customerId: customer.id });

    // Locking the admin out would leave a bad assignment fixable only with a
    // database client.
    expect(created.status).toBe(201);
    expect(created.body.data.assignedBy).toBe(admin.id);
  });
});
