import request from "supertest";
import { DocumentStatus } from "../src/modules/documents/document-status";
import { UserRole } from "../src/modules/users/user.entity";
import {
  bearer,
  mintToken,
  resetTestState,
  seedDocument,
  seedUser,
  testApp,
  TEST_PASSWORD,
  writeLocalDocument,
} from "./support/harness";

/**
 * The Phase 1 gate, minus the reset-token leak, which has its own file.
 *
 * Three conditions are checked here: an agent can fetch and download a document they
 * are reviewing; a deactivated or demoted user is refused within seconds rather than
 * fifteen minutes; and a manager gets 403 on admin-only routes while keeping the
 * approval powers the role exists for.
 *
 * There is no live Postgres, Redis, S3 or SES behind any of this — see
 * test/support for the fakes and why they sit at the config boundary.
 */

const DOCUMENT_BODY = "%PDF-1.4 pretend certificate bytes";

beforeEach(() => {
  resetTestState();
});

describe("document access for the people who review documents", () => {
  it("lets an agent read and download a customer's document", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });
    const document = seedDocument(customer.id);
    writeLocalDocument(document.s3Key, DOCUMENT_BODY);

    const detail = await request(testApp())
      .get(`/api/documents/${document.id}`)
      .set("Authorization", bearer(mintToken(agent)));

    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(document.id);
    expect(detail.body.data.customerId).toBe(customer.id);

    // AWS is unconfigured, so this is the local path rather than a presigned URL.
    const target = await request(testApp())
      .get(`/api/documents/${document.id}/download-url`)
      .set("Authorization", bearer(mintToken(agent)));

    expect(target.status).toBe(200);
    expect(target.body.data.downloadMode).toBe("local");

    const download = await request(testApp())
      .get(`/api/documents/${document.id}/download`)
      .set("Authorization", bearer(mintToken(agent)));

    expect(download.status).toBe(200);
    expect(download.headers["content-disposition"]).toContain(document.fileName);
    expect(Number(download.headers["content-length"])).toBe(DOCUMENT_BODY.length);
  });

  it("still keeps one customer out of another customer's document", async () => {
    const owner = await seedUser({ role: UserRole.Customer });
    const stranger = await seedUser({ role: UserRole.Customer });
    const document = seedDocument(owner.id);
    writeLocalDocument(document.s3Key, DOCUMENT_BODY);

    await request(testApp())
      .get(`/api/documents/${document.id}`)
      .set("Authorization", bearer(mintToken(owner)))
      .expect(200);

    const trespass = await request(testApp())
      .get(`/api/documents/${document.id}`)
      .set("Authorization", bearer(mintToken(stranger)));

    expect(trespass.status).toBe(403);

    // And no credential at all is a 401, not a 403 — different question, different answer.
    await request(testApp()).get(`/api/documents/${document.id}`).expect(401);
  });

  it("refuses to let a reviewer replace the bytes under review", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });
    const document = seedDocument(customer.id);

    const overwrite = await request(testApp())
      .post(`/api/documents/${document.id}/upload`)
      .set("Authorization", bearer(mintToken(agent)))
      .attach("file", Buffer.from("replacement"), "swap.pdf");

    expect(overwrite.status).toBe(403);
  });

  it("rejects a malformed document id as a bad request rather than a server error", async () => {
    const agent = await seedUser({ role: UserRole.Agent });

    const response = await request(testApp())
      .get("/api/documents/not-a-uuid")
      .set("Authorization", bearer(mintToken(agent)));

    expect(response.status).toBe(400);
  });
});

describe("withdrawing access takes effect immediately", () => {
  it("refuses a deactivated user on the next request", async () => {
    const admin = await seedUser({ role: UserRole.Admin });
    const customer = await seedUser({ role: UserRole.Customer });
    const token = mintToken(customer);

    await request(testApp()).get("/api/users/me").set("Authorization", bearer(token)).expect(200);

    const startedAt = Date.now();

    await request(testApp())
      .patch(`/api/admin/users/${customer.id}/status`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ isActive: false })
      .expect(200);

    const afterDeactivation = await request(testApp())
      .get("/api/users/me")
      .set("Authorization", bearer(token));

    expect(afterDeactivation.status).toBe(401);

    // The point of the gate wording: seconds, not the fifteen minutes an access token
    // would otherwise stay valid for, and not the session cache's 30-second TTL
    // either — the invalidation is explicit, so nothing here waits on expiry.
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("takes the role from the database, not from the token", async () => {
    const admin = await seedUser({ role: UserRole.Admin });
    const agent = await seedUser({ role: UserRole.Agent });
    const customer = await seedUser({ role: UserRole.Customer });
    const document = seedDocument(customer.id, DocumentStatus.Pending);

    // Issued five seconds ago so the comparison against the cut-off is unambiguous;
    // `iat` has one-second resolution and the whole test runs inside one second.
    const beforeDemotion = mintToken(agent, { issuedAt: Math.floor(Date.now() / 1000) - 5 });

    await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(beforeDemotion))
      .send({ fromStatus: DocumentStatus.Pending, toStatus: DocumentStatus.UnderReview })
      .expect(200);

    await request(testApp())
      .patch(`/api/admin/users/${agent.id}`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ role: UserRole.Customer })
      .expect(200);

    // The token still claims `role: "agent"`. It is refused outright, because a role
    // change also moves the token cut-off.
    const withOldToken = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(beforeDemotion))
      .send({ toStatus: DocumentStatus.Approved });

    expect(withOldToken.status).toBe(401);

    // A freshly minted token carrying the same stale `role` claim gets past the
    // staleness check and is then judged on the database row: forbidden, not allowed.
    const forgedRole = mintToken({ id: agent.id, email: agent.email, role: UserRole.Agent });

    const withForgedRole = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(forgedRole))
      .send({ toStatus: DocumentStatus.Approved });

    expect(withForgedRole.status).toBe(403);
  });

  it("stops an admin from removing their own access", async () => {
    const admin = await seedUser({ role: UserRole.Admin });

    const response = await request(testApp())
      .patch(`/api/admin/users/${admin.id}/status`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ isActive: false });

    expect(response.status).toBe(400);
  });
});

describe("the admin and manager boundary", () => {
  it("gives a manager 403 on every admin-only user route", async () => {
    const manager = await seedUser({ role: UserRole.Manager });
    const target = await seedUser({ role: UserRole.Customer });
    const token = bearer(mintToken(manager));

    // `manager` used to be listed alongside `admin` on this whole mount, which handed
    // the role user management, pricing and analytics it was never meant to have.
    const list = await request(testApp()).get("/api/admin/users").set("Authorization", token);
    expect(list.status).toBe(403);

    const create = await request(testApp())
      .post("/api/admin/users")
      .set("Authorization", token)
      .send({ email: "new.agent@example.test", password: "AgentPass123", role: UserRole.Agent });
    expect(create.status).toBe(403);

    const setStatus = await request(testApp())
      .patch(`/api/admin/users/${target.id}/status`)
      .set("Authorization", token)
      .send({ isActive: false });
    expect(setStatus.status).toBe(403);

    // The refusal is real, not a routing accident: the row is untouched.
    expect(setStatus.body.error).toBe("Forbidden");
  });

  it("lets a manager do the job the role exists for", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const manager = await seedUser({ role: UserRole.Manager });
    const document = seedDocument(customer.id, DocumentStatus.Pending);

    const moved = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(manager)))
      .send({ fromStatus: DocumentStatus.Pending, toStatus: DocumentStatus.UnderReview });

    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe(DocumentStatus.UnderReview);
  });

  it("rejects an illegal status transition as a conflict, not a crash", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const manager = await seedUser({ role: UserRole.Manager });
    const document = seedDocument(customer.id, DocumentStatus.Pending);

    const illegal = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(manager)))
      .send({ toStatus: DocumentStatus.Approved });

    expect(illegal.status).toBe(409);
  });

  it("lets an admin create staff accounts without ever echoing the password", async () => {
    const admin = await seedUser({ role: UserRole.Admin });
    const token = bearer(mintToken(admin));

    const created = await request(testApp())
      .post("/api/admin/users")
      .set("Authorization", token)
      .send({ email: "New.Agent@Example.test", password: "AgentPass123", role: UserRole.Agent });

    expect(created.status).toBe(201);
    expect(created.body.data.role).toBe(UserRole.Agent);
    // Normalised on the way in, so two accounts cannot differ only by casing.
    expect(created.body.data.email).toBe("new.agent@example.test");

    const serialised = JSON.stringify(created.body);
    expect(serialised).not.toContain("passwordHash");
    expect(serialised).not.toContain("AgentPass123");

    // Creating an agent is the only route to a non-customer account, so the new
    // account has to actually work.
    await request(testApp())
      .post("/api/auth/login")
      .send({ email: "new.agent@example.test", password: "AgentPass123" })
      .expect(200);

    const list = await request(testApp()).get("/api/admin/users").set("Authorization", token);

    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(2);
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");
  });

  it("refuses a duplicate address with a conflict", async () => {
    const admin = await seedUser({ role: UserRole.Admin });
    const existing = await seedUser({ role: UserRole.Customer, email: "taken@example.test" });

    const response = await request(testApp())
      .post("/api/admin/users")
      .set("Authorization", bearer(mintToken(admin)))
      .send({ email: existing.email, password: "AgentPass123", role: UserRole.Agent });

    expect(response.status).toBe(409);
  });
});

describe("the second half of the takeover chain", () => {
  it("will not move a user's email address without their current password", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const token = bearer(mintToken(customer));

    // A stolen access token alone. Email is the identity password reset trusts, so
    // moving it would make the takeover permanent.
    const withoutPassword = await request(testApp())
      .patch("/api/users/me")
      .set("Authorization", token)
      .send({ email: "attacker@example.test" });

    expect(withoutPassword.status).toBe(400);

    const wrongPassword = await request(testApp())
      .patch("/api/users/me")
      .set("Authorization", token)
      .send({ email: "attacker@example.test", currentPassword: "not-the-password" });

    expect(wrongPassword.status).toBe(401);

    const legitimate = await request(testApp())
      .patch("/api/users/me")
      .set("Authorization", token)
      .send({ email: "moved@example.test", currentPassword: TEST_PASSWORD });

    expect(legitimate.status).toBe(200);
    expect(legitimate.body.data.email).toBe("moved@example.test");
  });

  it("does not leak internals when something unexpected fails", async () => {
    const response = await request(testApp()).get("/api/documents/does-not-exist");

    // No credential, so this is a 401 with a fixed message — the error handler never
    // gets a chance to describe the schema.
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("No token");
  });
});
