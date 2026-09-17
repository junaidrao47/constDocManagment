import crypto from "crypto";
import request from "supertest";
import { DocumentStatus } from "../src/modules/documents/document-status";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedDocument, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

describe("public catalogue and calculator", () => {
  it("returns active catalogue data and calculates a quote", async () => {
    const locationId = crypto.randomUUID();
    const serviceId = crypto.randomUUID();
    const industryId = crypto.randomUUID();

    fakeDb.locations().seed({ id: locationId, state: "Punjab", city: "Lahore", multiplier: "1.2", cityFee: "500", isActive: true });
    fakeDb.services().seed({ id: serviceId, name: "Compliance review", description: "Review", basePrice: "2500", isActive: true });
    fakeDb.workerRanges().seed({ id: crypto.randomUUID(), minWorkers: 1, maxWorkers: 10, basePrice: "10000", isActive: true });
    fakeDb.industries().seed({ id: industryId, name: "Construction", description: null });

    const services = await request(testApp()).get("/api/public/services");
    expect(services.status).toBe(200);
    expect(services.body.data[0]).toMatchObject({ id: serviceId, basePrice: 2500 });

    const quote = await request(testApp()).post("/api/public/quotations/calculate").send({
      workerCount: 5,
      locationId,
      serviceIds: [serviceId],
      industryId,
    });

    expect(quote.status).toBe(200);
    expect(quote.body.data.total).toBe(15000);
  });

  it("rejects a calculator request for an unknown location", async () => {
    const response = await request(testApp()).post("/api/public/quotations/calculate").send({
      workerCount: 5,
      locationId: crypto.randomUUID(),
      serviceIds: [],
      industryId: crypto.randomUUID(),
    });

    expect(response.status).toBe(404);
  });
});

describe("customer and staff portal endpoints", () => {
  it("returns a customer dashboard and staff review collection", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });
    const document = seedDocument(customer.id, DocumentStatus.UnderReview);

    const dashboard = await request(testApp())
      .get("/api/customers/me/dashboard")
      .set("Authorization", bearer(mintToken(customer)));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.stats.documentsCount).toBe(1);
    expect(dashboard.body.data.attention.documents).toBe(0);

    const queue = await request(testApp())
      .get("/api/agent/documents?status=under_review")
      .set("Authorization", bearer(mintToken(agent)));
    expect(queue.status).toBe(200);
    expect(queue.body.data).toHaveLength(1);
    expect(queue.body.data[0].id).toBe(document.id);
  });

  it("keeps the staff collection endpoint protected", async () => {
    const response = await request(testApp()).get("/api/agent/documents");
    expect(response.status).toBe(401);
  });
});