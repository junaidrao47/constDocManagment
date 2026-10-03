import request from "supertest";
import { DocumentStatus } from "../src/modules/documents/document-status";
import { QuotationStatus } from "../src/modules/quotations/quotation-status";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedDocument, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

describe("status change notifications", () => {
  it("records a notification when a document status changes", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.status@test.com" });
    const document = seedDocument(customer.id, DocumentStatus.Pending);

    const response = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ toStatus: DocumentStatus.UnderReview, note: "Queued for review" });

    expect(response.status).toBe(200);
    const notifications = await fakeDb.notifications().find({ where: { userId: customer.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "document_status_change", channel: "email", status: "queued" });
  });

  it("records a notification when a quotation status changes", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "customer.quotations@test.com" });
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.status@test.com" });
    const quotationId = "11111111-1111-1111-1111-111111111111";

    fakeDb.quotations().seed({
      id: quotationId,
      customerId: customer.id,
      industryId: "industry-1",
      locationId: "location-1",
      workerCount: 6,
      totalPrice: "15000.00",
      status: QuotationStatus.Draft,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
      sentAt: null,
      acceptedAt: null,
      rejectionReason: null,
      items: [],
      customer: { id: customer.id, email: customer.email },
    });

    const response = await request(testApp())
      .patch(`/api/quotations/${quotationId}/status`)
      .set("Authorization", bearer(mintToken(manager)))
      .send({ status: QuotationStatus.Sent, note: "Sent to customer" });

    expect(response.status).toBe(200);
    const notifications = await fakeDb.notifications().find({ where: { userId: customer.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "quotation_status_change", channel: "email", status: "queued" });
  });
});
