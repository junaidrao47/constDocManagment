import crypto from "crypto";
import request from "supertest";
import { QuotationStatus, assertQuotationTransition } from "../src/modules/quotations/quotation-status";
import { UserRole } from "../src/modules/users/user.entity";
import { HttpError } from "../src/utils/http-error";
import { bearer, fakeDb, mintToken, resetTestState, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

describe("staff create quotations and line items", () => {
  async function seedPricingSetup() {
    const locationId = crypto.randomUUID();
    const serviceId = crypto.randomUUID();
    const industryId = crypto.randomUUID();

    fakeDb.locations().seed({
      id: locationId,
      state: "Punjab",
      city: "Lahore",
      multiplier: "1.2",
      cityFee: "500",
      isActive: true,
    });
    fakeDb.services().seed({
      id: serviceId,
      name: "Permit Consultation",
      description: "Consultation",
      basePrice: "2500",
      isActive: true,
    });
    fakeDb.workerRanges().seed({
      id: crypto.randomUUID(),
      minWorkers: 1,
      maxWorkers: 10,
      basePrice: "10000",
      isActive: true,
    });
    fakeDb.industries().seed({
      id: industryId,
      name: "Construction",
      description: null,
      priceWeight: "1.0000",
      isActive: true,
    });

    return { locationId, serviceId, industryId };
  }

  it("staff create happy path: agent creates quote with engine lines and extra lines", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });

    const payload = {
      customerId: customer.id,
      industryId,
      locationId,
      workerCount: 5,
      serviceIds: [serviceId],
      extraLines: [
        { kind: "gov_fee", label: "Municipal filing fee", amount: 1200 },
        { kind: "discount", label: "New client promotion", amount: 500 },
      ],
    };

    const res = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(QuotationStatus.Draft);
    expect(res.body.data.customerId).toBe(customer.id);

    // Engine subtotal = (10000 * 1.2 * 1) + 2500 = 14500
    // Engine total = 14500 + 500 (cityFee) = 15000
    // Final total = 15000 + 1200 (gov_fee) - 500 (discount) = 15700.00
    expect(res.body.data.totalPrice).toBe("15700.00");

    // Line items verification
    const items = res.body.data.items;
    expect(items).toHaveLength(5);

    const workerBaseItem = items.find((i: any) => i.kind === "worker_base");
    expect(workerBaseItem).toMatchObject({
      label: "Worker base",
      quantity: 1,
      unitPrice: "12000.00",
      lineTotal: "12000.00",
    });

    const serviceItem = items.find((i: any) => i.kind === "service");
    expect(serviceItem).toBeDefined();
    expect(serviceItem.serviceId).toBe(serviceId);
    expect(serviceItem.quantity).toBe(1);
    expect(serviceItem.unitPrice).toBe("2500.00");
    expect(serviceItem.lineTotal).toBe("2500.00");

    const govFeeItem = items.find((i: any) => i.kind === "gov_fee");
    expect(govFeeItem).toBeDefined();
    expect(govFeeItem.quantity).toBe(1);
    const extraGovFeeItem = items.find((i: any) => i.label === "Municipal filing fee");
    expect(govFeeItem.unitPrice).toBe("500.00");
    expect(govFeeItem.lineTotal).toBe("500.00");
    expect(extraGovFeeItem.unitPrice).toBe("1200.00");
    expect(extraGovFeeItem.lineTotal).toBe("1200.00");

    const discountItem = items.find((i: any) => i.kind === "discount");
    expect(discountItem).toBeDefined();
    expect(discountItem.quantity).toBe(1);
    expect(discountItem.label).toBe("New client promotion");
    expect(discountItem.unitPrice).toBe("-500.00");
    expect(discountItem.lineTotal).toBe("-500.00");

    // Fetch via GET /api/agent/quotations/:id
    const getRes = await request(testApp())
      .get(`/api/agent/quotations/${res.body.data.id}`)
      .set("Authorization", bearer(mintToken(agent)));

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.items).toHaveLength(5);
    expect(getRes.body.data.items[0]).toHaveProperty("kind");
    expect(getRes.body.data.items[0]).toHaveProperty("quantity");
    expect(getRes.body.data.items[0]).toHaveProperty("unitPrice");
    expect(getRes.body.data.items[0]).toHaveProperty("lineTotal");
  });

  it("staff create happy path: admin creates quote", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const customer = await seedUser({ role: UserRole.Customer });
    const admin = await seedUser({ role: UserRole.Admin });

    const payload = {
      customerId: customer.id,
      industryId,
      locationId,
      workerCount: 5,
      serviceIds: [serviceId],
      extraLines: [{ kind: "gov_fee", label: "State fee", amount: 300 }],
    };

    const res = await request(testApp())
      .post("/api/admin/quotations")
      .set("Authorization", bearer(mintToken(admin)))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(QuotationStatus.Draft);
    // 15000 + 300 = 15300.00
    expect(res.body.data.totalPrice).toBe("15300.00");
  });

  it("staff create happy path: manager creates quote via /api/agent/quotations", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const customer = await seedUser({ role: UserRole.Customer });
    const manager = await seedUser({ role: UserRole.Manager });

    const res = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(manager)))
      .send({
        customerId: customer.id,
        industryId,
        locationId,
        workerCount: 5,
        serviceIds: [serviceId],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.totalPrice).toBe("15000.00");
  });

  it("wrong role gets 403 on staff quotation creation endpoints (RBAC)", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });
    const manager = await seedUser({ role: UserRole.Manager });

    const payload = {
      customerId: customer.id,
      industryId,
      locationId,
      workerCount: 5,
      serviceIds: [serviceId],
    };

    // Customer cannot create via /api/agent/quotations
    const custAgentRes = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(customer)))
      .send(payload);
    expect(custAgentRes.status).toBe(403);

    // Customer cannot create via /api/admin/quotations
    const custAdminRes = await request(testApp())
      .post("/api/admin/quotations")
      .set("Authorization", bearer(mintToken(customer)))
      .send(payload);
    expect(custAdminRes.status).toBe(403);

    // Agent cannot create via /api/admin/quotations
    const agentAdminRes = await request(testApp())
      .post("/api/admin/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send(payload);
    expect(agentAdminRes.status).toBe(403);

    // Manager cannot create via /api/admin/quotations
    const mgrAdminRes = await request(testApp())
      .post("/api/admin/quotations")
      .set("Authorization", bearer(mintToken(manager)))
      .send(payload);
    expect(mgrAdminRes.status).toBe(403);
  });

  it("returns 404 when customer is not found or not in customer role", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const agent = await seedUser({ role: UserRole.Agent });
    const anotherStaff = await seedUser({ role: UserRole.Agent });

    // Non-existent customer ID
    const notFoundRes = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send({
        customerId: crypto.randomUUID(),
        industryId,
        locationId,
        workerCount: 5,
        serviceIds: [serviceId],
      });
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.error).toMatch(/customer not found/i);

    // User exists but has role agent instead of customer
    const wrongRoleTargetRes = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send({
        customerId: anotherStaff.id,
        industryId,
        locationId,
        workerCount: 5,
        serviceIds: [serviceId],
      });
    expect(wrongRoleTargetRes.status).toBe(404);
    expect(wrongRoleTargetRes.body.error).toMatch(/customer not found/i);
  });

  it("rejects a discount larger than the subtotal with 400", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });

    // Subtotal is 14500. Discount of 15000 exceeds subtotal.
    const res = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send({
        customerId: customer.id,
        industryId,
        locationId,
        workerCount: 5,
        serviceIds: [serviceId],
        extraLines: [{ kind: "discount", label: "Massive discount", amount: 15000 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/discount cannot exceed subtotal/i);
  });

  it("accurately computes total math with gov fee and discount using integer cents", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });

    // Subtotal: 14500, cityFee: 500, engine total: 15000
    // gov_fee: 1234.56, discount: 567.89
    // Expected final total: 15000 + 1234.56 - 567.89 = 15666.67
    const res = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send({
        customerId: customer.id,
        industryId,
        locationId,
        workerCount: 5,
        serviceIds: [serviceId],
        extraLines: [
          { kind: "gov_fee", label: "Gov fee", amount: 1234.56 },
          { kind: "discount", label: "Discount", amount: 567.89 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.totalPrice).toBe("15666.67");
  });

  it("rejects non-positive amounts and more than 20 extra lines via zod validation", async () => {
    const { locationId, serviceId, industryId } = await seedPricingSetup();
    const customer = await seedUser({ role: UserRole.Customer });
    const agent = await seedUser({ role: UserRole.Agent });

    // Amount <= 0
    const nonPosRes = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send({
        customerId: customer.id,
        industryId,
        locationId,
        workerCount: 5,
        serviceIds: [serviceId],
        extraLines: [{ kind: "discount", label: "Zero discount", amount: 0 }],
      });
    expect(nonPosRes.status).toBe(400);

    // Over 20 extra lines
    const over20Lines = Array.from({ length: 21 }, (_, i) => ({
      kind: "gov_fee",
      label: `Fee ${i}`,
      amount: 10,
    }));
    const over20Res = await request(testApp())
      .post("/api/agent/quotations")
      .set("Authorization", bearer(mintToken(agent)))
      .send({
        customerId: customer.id,
        industryId,
        locationId,
        workerCount: 5,
        serviceIds: [serviceId],
        extraLines: over20Lines,
      });
    expect(over20Res.status).toBe(400);
  });

  describe("status transition rules", () => {
    it("allows draft -> cancelled and sent -> cancelled", () => {
      expect(() => assertQuotationTransition(QuotationStatus.Draft, QuotationStatus.Cancelled)).not.toThrow();
      expect(() => assertQuotationTransition(QuotationStatus.Sent, QuotationStatus.Cancelled)).not.toThrow();
    });

    it("allows accepted -> converted", () => {
      expect(() => assertQuotationTransition(QuotationStatus.Accepted, QuotationStatus.Converted)).not.toThrow();
    });

    it("blocks converted -> anything", () => {
      const allStatuses = Object.values(QuotationStatus);
      for (const target of allStatuses) {
        expect(() => assertQuotationTransition(QuotationStatus.Converted, target)).toThrow(HttpError);
      }
    });

    it("blocks transitions out of cancelled", () => {
      const allStatuses = Object.values(QuotationStatus);
      for (const target of allStatuses) {
        expect(() => assertQuotationTransition(QuotationStatus.Cancelled, target)).toThrow(HttpError);
      }
    });

    it("executes transition to converted and blocks subsequent changes via HTTP endpoint", async () => {
      const customer = await seedUser({ role: UserRole.Customer });
      const manager = await seedUser({ role: UserRole.Manager });
      const quotationId = crypto.randomUUID();

      fakeDb.quotations().seed({
        id: quotationId,
        customerId: customer.id,
        industryId: crypto.randomUUID(),
        locationId: crypto.randomUUID(),
        workerCount: 5,
        totalPrice: "10000.00",
        status: QuotationStatus.Accepted,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
        sentAt: new Date(),
        acceptedAt: new Date(),
        rejectionReason: null,
        items: [],
      });

      // Move Accepted -> Converted
      const convertRes = await request(testApp())
        .patch(`/api/agent/quotations/${quotationId}/status`)
        .set("Authorization", bearer(mintToken(manager)))
        .send({ status: QuotationStatus.Converted, note: "Project started" });

      expect(convertRes.status).toBe(200);
      expect(convertRes.body.data.status).toBe(QuotationStatus.Converted);

      // Attempt moving Converted -> Draft (blocked)
      const blockedRes = await request(testApp())
        .patch(`/api/agent/quotations/${quotationId}/status`)
        .set("Authorization", bearer(mintToken(manager)))
        .send({ status: QuotationStatus.Draft });

      expect(blockedRes.status).toBe(409);
    });
  });
});
