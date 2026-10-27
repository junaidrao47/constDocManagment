import request from "supertest";
import { DocumentStatus } from "../src/modules/documents/document-status";
import { QuotationStatus } from "../src/modules/quotations/quotation-status";
import { UserRole } from "../src/modules/users/user.entity";
import {
  bearer,
  fakeDb,
  mintToken,
  resetTestState,
  seedAssignment,
  seedDocument,
  seedManagerAssignment,
  seedUser,
  testApp,
  writeLocalDocument,
} from "./support/harness";

beforeEach(() => resetTestState());

let quotationCounter = 0;

function seedQuotation(customerId: string) {
  quotationCounter += 1;
  const id = `scoped-quotation-${quotationCounter}`;
  fakeDb.quotations().seed({
    id,
    customerId,
    industryId: "industry-1",
    locationId: "location-1",
    workerCount: 5,
    totalPrice: "10000.00",
    currency: "MXN",
    status: QuotationStatus.Draft,
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: null,
    acceptedAt: null,
    rejectionReason: null,
    items: [],
  });
  return id;
}

/**
 * Two customers, one agent assigned to the first only. Every case below asks
 * whether the agent can reach the second — the customer they are not responsible
 * for — through each surface.
 */
async function twoCustomers() {
  const assignedCustomer = await seedUser({ role: UserRole.Customer, email: `mine.${quotationCounter}@test.com` });
  const strangerCustomer = await seedUser({ role: UserRole.Customer, email: `theirs.${quotationCounter}@test.com` });
  const agent = await seedUser({ role: UserRole.Agent, email: `agent.${quotationCounter}@test.com` });
  seedAssignment(agent.id, assignedCustomer.id);

  return { assignedCustomer, strangerCustomer, agent, token: bearer(mintToken(agent)) };
}

describe("an agent is refused a document outside their book", () => {
  it("403s a direct fetch by id, rather than 404 or an empty result", async () => {
    const { strangerCustomer, token } = await twoCustomers();
    const document = seedDocument(strangerCustomer.id);

    const response = await request(testApp())
      .get(`/api/documents/${document.id}`)
      .set("Authorization", token);

    // 403 not 404: api-surface.md section 8 requires that a record which exists but
    // is not yours is distinguishable from one that does not exist, so an
    // assignment bug cannot masquerade as missing data.
    expect(response.status).toBe(403);
  });

  it("403s the download url and the history", async () => {
    const { strangerCustomer, token } = await twoCustomers();
    const document = seedDocument(strangerCustomer.id);

    await request(testApp())
      .get(`/api/documents/${document.id}/download-url`)
      .set("Authorization", token)
      .expect(403);

    await request(testApp())
      .get(`/api/documents/${document.id}/history`)
      .set("Authorization", token)
      .expect(403);
  });

  it("403s a status change, so a reviewer cannot act on what they cannot read", async () => {
    const { strangerCustomer, token } = await twoCustomers();
    const document = seedDocument(strangerCustomer.id, DocumentStatus.Pending);

    const response = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", token)
      .send({ fromStatus: DocumentStatus.Pending, toStatus: DocumentStatus.UnderReview });

    // The write path previously gated on role alone, so an agent could approve a
    // document they were forbidden to open.
    expect(response.status).toBe(403);
    const unchanged = await fakeDb.documents().findOne({ where: { id: document.id } });
    expect(unchanged?.status).toBe(DocumentStatus.Pending);
  });

  it("403s an approved-version upload", async () => {
    const { strangerCustomer, token } = await twoCustomers();
    const document = seedDocument(strangerCustomer.id);

    await request(testApp())
      .post(`/api/documents/${document.id}/approved-upload`)
      .set("Authorization", token)
      .attach("file", Buffer.from("approved bytes"), "approved.pdf")
      .expect(403);
  });

  it("omits the document from the review queue", async () => {
    const { assignedCustomer, strangerCustomer, token } = await twoCustomers();
    const mine = seedDocument(assignedCustomer.id, DocumentStatus.Pending);
    const theirs = seedDocument(strangerCustomer.id, DocumentStatus.Pending);

    const response = await request(testApp()).get("/api/agent/documents").set("Authorization", token);

    expect(response.status).toBe(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    // Both halves in one assertion: the assigned row is present, the other absent.
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  it("omits the quotation from the agent list", async () => {
    const { assignedCustomer, strangerCustomer, token } = await twoCustomers();
    const mine = seedQuotation(assignedCustomer.id);
    const theirs = seedQuotation(strangerCustomer.id);

    const response = await request(testApp()).get("/api/agent/quotations").set("Authorization", token);

    expect(response.status).toBe(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it("narrows total, not just the slice, on a paginated quotation list", async () => {
    const { assignedCustomer, strangerCustomer, token } = await twoCustomers();
    seedQuotation(assignedCustomer.id);
    seedQuotation(strangerCustomer.id);
    seedQuotation(strangerCustomer.id);

    const response = await request(testApp())
      .get("/api/agent/quotations?page=1&pageSize=50")
      .set("Authorization", token);

    expect(response.status).toBe(200);
    // A total of 3 would disclose how much work exists outside the agent's book.
    expect(response.body.data.pagination.total).toBe(1);
  });
});

describe("an agent can do their job for an assigned customer", () => {
  it("reads, downloads and changes the status of an assigned customer's document", async () => {
    const { assignedCustomer, token } = await twoCustomers();
    const document = seedDocument(assignedCustomer.id, DocumentStatus.Pending);
    writeLocalDocument(document.s3Key, "assigned document body");

    await request(testApp()).get(`/api/documents/${document.id}`).set("Authorization", token).expect(200);
    await request(testApp()).get(`/api/documents/${document.id}/download-url`).set("Authorization", token).expect(200);

    const moved = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", token)
      .send({ fromStatus: DocumentStatus.Pending, toStatus: DocumentStatus.UnderReview });

    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe(DocumentStatus.UnderReview);
  });

  it("uploads an approved version for an assigned customer", async () => {
    const { assignedCustomer, token } = await twoCustomers();
    // An official file can only be uploaded once the document has been taken to the
    // government, so the fixture starts it there (the former jump-straight-to-approved
    // path was the audited R56 defect).
    const document = seedDocument(assignedCustomer.id, DocumentStatus.SubmittedToGovernment);

    const approved = await request(testApp())
      .post(`/api/documents/${document.id}/approved-upload`)
      .set("Authorization", token)
      // Real PDF bytes: the confirm step sniffs the magic bytes against the declared type.
      .attach("file", Buffer.from("%PDF-1.4\napproved certificate\n%%EOF"), "approved.pdf");

    expect(approved.status).toBe(200);
    expect(approved.body.data.approvedFileName).toBe("approved.pdf");
    expect(approved.body.data.status).toBe(DocumentStatus.Approved);
  });
});

describe("an agent with no assignments at all", () => {
  it("sees empty lists rather than everything", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.noassign@test.com" });
    const agent = await seedUser({ role: UserRole.Agent, email: "agent.noassign@test.com" });
    seedDocument(customer.id, DocumentStatus.Pending);
    seedQuotation(customer.id);
    const token = bearer(mintToken(agent));

    const documents = await request(testApp()).get("/api/agent/documents").set("Authorization", token);
    const quotations = await request(testApp()).get("/api/agent/quotations").set("Authorization", token);

    // The scope is an empty array, not "no filter" — the distinction the helper
    // draws between [] and null. Getting it wrong would show them everything.
    expect(documents.body.data).toEqual([]);
    expect(quotations.body.data).toEqual([]);
  });
});

describe("managers are scoped to their assigned customers (PROJECT-BRIEF §11.2)", () => {
  it("sees an assigned customer's documents and quotations, not an unassigned one's", async () => {
    const { assignedCustomer, strangerCustomer } = await twoCustomers();
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.scope@test.com" });
    seedManagerAssignment(manager.id, assignedCustomer.id);
    const mine = seedDocument(assignedCustomer.id, DocumentStatus.Pending);
    const theirs = seedDocument(strangerCustomer.id, DocumentStatus.Pending);
    seedQuotation(assignedCustomer.id);
    seedQuotation(strangerCustomer.id);
    const token = bearer(mintToken(manager));

    // The 2026-10-24 decisions added customer_manager_assignments and a "My customers"
    // workspace, so a manager now narrows to their assigned customers (not org-wide).
    const documents = await request(testApp()).get("/api/agent/documents").set("Authorization", token);
    const ids = documents.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);

    const quotations = await request(testApp()).get("/api/agent/quotations").set("Authorization", token);
    expect(quotations.body.data).toHaveLength(1);
  });

  it("with no assignment sees nothing, like an agent", async () => {
    const { strangerCustomer } = await twoCustomers();
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.noassign@test.com" });
    seedDocument(strangerCustomer.id, DocumentStatus.Pending);
    seedQuotation(strangerCustomer.id);
    const token = bearer(mintToken(manager));

    const documents = await request(testApp()).get("/api/agent/documents").set("Authorization", token);
    expect(documents.body.data).toEqual([]);

    const quotations = await request(testApp()).get("/api/agent/quotations").set("Authorization", token);
    expect(quotations.body.data).toEqual([]);
  });
});

describe("the narrowing does not touch admin or customers", () => {

  it("leaves admin unrestricted", async () => {
    const { strangerCustomer } = await twoCustomers();
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.scope@test.com" });
    const document = seedDocument(strangerCustomer.id);

    await request(testApp())
      .get(`/api/documents/${document.id}`)
      .set("Authorization", bearer(mintToken(admin)))
      .expect(200);
  });

  it("leaves a customer own-only, and still refuses another customer's document", async () => {
    const { assignedCustomer, strangerCustomer } = await twoCustomers();
    const own = seedDocument(assignedCustomer.id);
    const other = seedDocument(strangerCustomer.id);
    const token = bearer(mintToken(assignedCustomer));

    await request(testApp()).get(`/api/documents/${own.id}`).set("Authorization", token).expect(200);
    await request(testApp()).get(`/api/documents/${other.id}`).set("Authorization", token).expect(403);
  });
});
