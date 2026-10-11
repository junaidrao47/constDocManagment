import crypto from "crypto";
import request from "supertest";
import { DocumentStatus } from "../src/modules/documents/document-status";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedDocument, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

describe("document rejection and admin endpoints", () => {
  it("rejects a staff status change without a five-character rejection note", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });
    const document = seedDocument(customer.id, DocumentStatus.UnderReview);

    const response = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(agent)))
      .send({ toStatus: DocumentStatus.Rejected });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/rejection note/i);
  });

  it("lists all customers' documents with status/customer filters and pagination", async () => {
    const customerOne = await seedUser({ role: UserRole.Customer });
    const customerTwo = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });
    const first = seedDocument(customerOne.id, DocumentStatus.Pending);
    seedDocument(customerOne.id, DocumentStatus.Approved);
    seedDocument(customerTwo.id, DocumentStatus.Pending);

    const response = await request(testApp())
      .get(`/api/admin/documents?status=${DocumentStatus.Pending}&customerId=${customerOne.id}&page=1&pageSize=1`)
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(200);
    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.data[0].id).toBe(first.id);
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1, totalPages: 1 });
  });

  it("requires admin role and a note for admin override", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });
    const document = seedDocument(customer.id, DocumentStatus.Pending);

    const forbidden = await request(testApp())
      .patch(`/api/admin/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(customer)))
      .send({ toStatus: DocumentStatus.Rejected, note: "Needs correction" });
    expect(forbidden.status).toBe(403);

    const missingNote = await request(testApp())
      .patch(`/api/admin/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ toStatus: DocumentStatus.Approved });
    expect(missingNote.status).toBe(400);

    const rejectedWithoutNote = await request(testApp())
      .patch(`/api/admin/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ toStatus: DocumentStatus.Rejected, note: "  " });
    expect(rejectedWithoutNote.status).toBe(400);

    const override = await request(testApp())
      .patch(`/api/admin/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ toStatus: DocumentStatus.Rejected, note: "Override rejection with reason" });
    expect(override.status).toBe(200);
    expect(override.body.data.status).toBe(DocumentStatus.Rejected);
    expect(fakeDb.documentHistory().all().at(-1)).toMatchObject({
      documentId: document.id,
      changedBy: admin.id,
      note: "Override rejection with reason",
    });
  });

  it("restricts the admin document list to admins", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const response = await request(testApp())
      .get("/api/admin/documents")
      .set("Authorization", bearer(mintToken(customer)));
    expect(response.status).toBe(403);
  });

  it("validates admin document query filters", async () => {
    const admin = await seedUser({ role: UserRole.Admin });
    const response = await request(testApp())
      .get(`/api/admin/documents?customerId=${crypto.randomUUID()}&page=0`)
      .set("Authorization", bearer(mintToken(admin)));
    expect(response.status).toBe(400);
  });
});
