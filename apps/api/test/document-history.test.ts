import request from "supertest";
import { DocumentStatus } from "../src/modules/documents/document-status";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedAssignment, seedDocument, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

let historyCounter = 0;

function seedHistory(
  documentId: string,
  toStatus: DocumentStatus,
  options: { fromStatus?: DocumentStatus | null; changedBy?: string | null; note?: string | null; at?: Date } = {},
) {
  historyCounter += 1;
  const id = `history-${historyCounter}`;
  fakeDb.documentHistory().seed({
    id,
    documentId,
    fromStatus: options.fromStatus ?? null,
    toStatus,
    changedBy: options.changedBy ?? null,
    note: options.note ?? null,
    createdAt: options.at ?? new Date(2026, 0, historyCounter),
    updatedAt: options.at ?? new Date(2026, 0, historyCounter),
  });
  return id;
}

describe("GET /api/documents/:id/history", () => {
  it("returns the owning customer's trail oldest first, with no fromStatus on the first row", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "owner.history@test.com" });
    const document = seedDocument(customer.id, DocumentStatus.Approved);
    seedHistory(document.id, DocumentStatus.Pending, { at: new Date(2026, 0, 1) });
    seedHistory(document.id, DocumentStatus.UnderReview, {
      fromStatus: DocumentStatus.Pending,
      at: new Date(2026, 0, 2),
    });

    const response = await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", bearer(mintToken(customer)));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).toMatchObject({ fromStatus: null, toStatus: DocumentStatus.Pending });
    expect(response.body.data[1]).toMatchObject({
      fromStatus: DocumentStatus.Pending,
      toStatus: DocumentStatus.UnderReview,
    });
  });

  it("returns 403 to a different customer, not 404 and not an empty array", async () => {
    const owner = await seedUser({ role: UserRole.Customer, email: "owner.403@test.com" });
    const other = await seedUser({ role: UserRole.Customer, email: "other.403@test.com" });
    const document = seedDocument(owner.id, DocumentStatus.Pending);
    seedHistory(document.id, DocumentStatus.Pending);

    const response = await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", bearer(mintToken(other)));

    // api-surface.md section 8: a record that exists but is not yours is 403 on a
    // direct fetch by id. An empty array would make an assignment bug look like
    // missing data.
    expect(response.status).toBe(403);
  });

  it.each([
    ["agent", UserRole.Agent],
    ["manager", UserRole.Manager],
    ["admin", UserRole.Admin],
  ])("lets a %s read the trail", async (label, role) => {
    const customer = await seedUser({ role: UserRole.Customer, email: `cust.staff.${label}@test.com` });
    const staff = await seedUser({ role, email: `staff.${label}@test.com` });
    const document = seedDocument(customer.id, DocumentStatus.Pending);
    seedHistory(document.id, DocumentStatus.Pending);
    // An agent needs the assignment; manager and admin are unrestricted, and
    // seeding it for them changes nothing.
    seedAssignment(staff.id, customer.id);

    const response = await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", bearer(mintToken(staff)));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("returns 404 for an unknown document id", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.404hist@test.com" });

    const response = await request(testApp())
      .get("/api/documents/99999999-9999-9999-9999-999999999999/history")
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(404);
  });

  it("reduces the actor to exactly the public user fields", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.actor@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.actor@test.com" });
    const document = seedDocument(customer.id, DocumentStatus.UnderReview);
    seedHistory(document.id, DocumentStatus.UnderReview, {
      fromStatus: DocumentStatus.Pending,
      changedBy: agent.id,
    });

    const response = await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", bearer(mintToken(customer)));

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data[0].changedBy).sort()).toEqual(
      ["email", "id", "name", "phone", "role"].sort(),
    );
    expect(response.body.data[0].changedBy).toMatchObject({ id: agent.id, email: agent.email, role: UserRole.Agent });
  });

  it("returns changedBy: null for a system transition", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.system@test.com" });
    const document = seedDocument(customer.id, DocumentStatus.Expired);
    seedHistory(document.id, DocumentStatus.Expired, { fromStatus: DocumentStatus.Approved, changedBy: null });

    const response = await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", bearer(mintToken(customer)));

    expect(response.status).toBe(200);
    expect(response.body.data[0].changedBy).toBeNull();
  });

  it("never serialises a user secret", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.secret@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.secret@test.com" });
    const document = seedDocument(customer.id, DocumentStatus.Approved);
    seedHistory(document.id, DocumentStatus.Approved, { fromStatus: DocumentStatus.UnderReview, changedBy: agent.id });

    const response = await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", bearer(mintToken(customer)));

    // Asserted on the serialised body, not the object: the fake repository
    // hydrates the full user row precisely so this can fail.
    const body = JSON.stringify(response.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("tokensValidFrom");
  });

  it("records a row per real transition driven through the status endpoint", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.e2e@test.com" });
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.e2e@test.com" });
    const document = seedDocument(customer.id, DocumentStatus.Pending);
    const adminAuth = bearer(mintToken(admin));

    for (const toStatus of [DocumentStatus.UnderReview, DocumentStatus.Approved]) {
      const transition = await request(testApp())
        .patch(`/api/documents/${document.id}/status`)
        .set("Authorization", adminAuth)
        .send({ toStatus });
      expect(transition.status).toBe(200);
    }

    const response = await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", bearer(mintToken(customer)));

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { toStatus: string }) => row.toStatus)).toEqual([
      DocumentStatus.UnderReview,
      DocumentStatus.Approved,
    ]);
    expect(response.body.data[0].changedBy).toMatchObject({ id: admin.id, role: UserRole.Admin });
  });
});
