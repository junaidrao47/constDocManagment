import crypto from "crypto";
import request from "supertest";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function adminToken() {
  const admin = await seedUser({ role: UserRole.Admin });
  return bearer(mintToken(admin));
}

async function customerToken() {
  const customer = await seedUser({ role: UserRole.Customer });
  return bearer(mintToken(customer));
}

function seedWorkerRange(min: number, max: number | null, active = true, price = "1000") {
  const id = crypto.randomUUID();
  fakeDb.workerRanges().seed({ id, minWorkers: min, maxWorkers: max, basePrice: price, isActive: active });
  return id;
}

function seedSetting(key: string, value: unknown) {
  fakeDb.appSettings().seed({ key, value, updatedBy: null, updatedAt: new Date() } as any);
}

// ─── Services CRUD ────────────────────────────────────────────────────────────

describe("admin services CRUD", () => {
  it("creates a service", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/services")
      .set("Authorization", token)
      .send({ name: "Fire Safety Audit", description: "Audit", basePrice: 1500 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Fire Safety Audit",
      description: "Audit",
      basePrice: 1500,
      isActive: true,
    });
  });

  it("lists services including inactive when not filtered, and filters by isActive", async () => {
    const token = await adminToken();
    fakeDb.services().seed({ id: crypto.randomUUID(), name: "Active Service", basePrice: "100", isActive: true });
    fakeDb.services().seed({ id: crypto.randomUUID(), name: "Inactive Service", basePrice: "200", isActive: false });

    const allRes = await request(testApp()).get("/api/admin/services").set("Authorization", token);
    expect(allRes.status).toBe(200);
    expect(allRes.body.data).toHaveLength(2);

    const activeRes = await request(testApp()).get("/api/admin/services?isActive=true").set("Authorization", token);
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data).toHaveLength(1);
    expect(activeRes.body.data[0].name).toBe("Active Service");

    const inactiveRes = await request(testApp()).get("/api/admin/services?isActive=false").set("Authorization", token);
    expect(inactiveRes.status).toBe(200);
    expect(inactiveRes.body.data).toHaveLength(1);
    expect(inactiveRes.body.data[0].name).toBe("Inactive Service");
  });

  it("updates a service", async () => {
    const token = await adminToken();
    const id = crypto.randomUUID();
    fakeDb.services().seed({ id, name: "Old Name", basePrice: "100", isActive: true });

    const res = await request(testApp())
      .patch(`/api/admin/services/${id}`)
      .set("Authorization", token)
      .send({ name: "New Name", basePrice: 250 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "New Name", basePrice: 250 });
  });

  it("deactivates a service (DELETE sets isActive=false, never hard deletes)", async () => {
    const token = await adminToken();
    const id = crypto.randomUUID();
    fakeDb.services().seed({ id, name: "To Deactivate", basePrice: "100", isActive: true });

    const res = await request(testApp()).delete(`/api/admin/services/${id}`).set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // Verify row still exists in DB
    const inDb = await fakeDb.services().findOne({ where: { id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.isActive).toBe(false);
  });

  it("fails validation on invalid input", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/services")
      .set("Authorization", token)
      .send({ name: "", basePrice: -5 });
    expect(res.status).toBe(400);
  });

  it("rejects non-admin with 403", async () => {
    const token = await customerToken();
    const res = await request(testApp()).get("/api/admin/services").set("Authorization", token);
    expect(res.status).toBe(403);
  });
});

// ─── Industries CRUD ──────────────────────────────────────────────────────────

describe("admin industries CRUD", () => {
  it("creates an industry with priceWeight", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/industries")
      .set("Authorization", token)
      .send({ name: "Mining", description: "Heavy", priceWeight: 1.35 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Mining",
      description: "Heavy",
      priceWeight: 1.35,
      isActive: true,
    });
  });

  it("lists industries and filters by isActive", async () => {
    const token = await adminToken();
    fakeDb.industries().seed({ id: crypto.randomUUID(), name: "Ind1", priceWeight: "1.0000", isActive: true });
    fakeDb.industries().seed({ id: crypto.randomUUID(), name: "Ind2", priceWeight: "1.2000", isActive: false });

    const res = await request(testApp()).get("/api/admin/industries").set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const activeRes = await request(testApp()).get("/api/admin/industries?isActive=true").set("Authorization", token);
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data).toHaveLength(1);
    expect(activeRes.body.data[0].name).toBe("Ind1");
  });

  it("updates an industry priceWeight", async () => {
    const token = await adminToken();
    const id = crypto.randomUUID();
    fakeDb.industries().seed({ id, name: "Construction", priceWeight: "1.0000", isActive: true });

    const res = await request(testApp())
      .patch(`/api/admin/industries/${id}`)
      .set("Authorization", token)
      .send({ priceWeight: 1.5 });
    expect(res.status).toBe(200);
    expect(res.body.data.priceWeight).toBeCloseTo(1.5);
  });

  it("deactivates an industry (DELETE sets isActive=false)", async () => {
    const token = await adminToken();
    const id = crypto.randomUUID();
    fakeDb.industries().seed({ id, name: "Industrial", priceWeight: "1.0000", isActive: true });

    const res = await request(testApp()).delete(`/api/admin/industries/${id}`).set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it("fails validation on invalid priceWeight", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/industries")
      .set("Authorization", token)
      .send({ name: "Test", priceWeight: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects non-admin with 403", async () => {
    const token = await customerToken();
    const res = await request(testApp()).get("/api/admin/industries").set("Authorization", token);
    expect(res.status).toBe(403);
  });
});

// ─── Worker Ranges CRUD & Overlap Rules ───────────────────────────────────────

describe("admin worker-ranges CRUD and overlap rules", () => {
  it("creates a worker range", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/worker-ranges")
      .set("Authorization", token)
      .send({ minWorkers: 1, maxWorkers: 10, basePrice: 5000 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ minWorkers: 1, maxWorkers: 10, basePrice: 5000, isActive: true });
  });

  it("updates a worker range", async () => {
    const token = await adminToken();
    const id = seedWorkerRange(1, 10);

    const res = await request(testApp())
      .patch(`/api/admin/worker-ranges/${id}`)
      .set("Authorization", token)
      .send({ basePrice: 6000 });
    expect(res.status).toBe(200);
    expect(res.body.data.basePrice).toBe(6000);
  });

  it("deactivates a worker range (DELETE sets isActive=false)", async () => {
    const token = await adminToken();
    const id = seedWorkerRange(1, 10);

    const res = await request(testApp()).delete(`/api/admin/worker-ranges/${id}`).set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it("rejects min > max", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/worker-ranges")
      .set("Authorization", token)
      .send({ minWorkers: 20, maxWorkers: 10, basePrice: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.error ?? res.body.message).toMatch(/minWorkers/);
  });

  it("rejects overlap with other active ranges", async () => {
    seedWorkerRange(1, 10);
    const token = await adminToken();

    // Partial overlap: 5 to 15
    const res = await request(testApp())
      .post("/api/admin/worker-ranges")
      .set("Authorization", token)
      .send({ minWorkers: 5, maxWorkers: 15, basePrice: 2000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/overlaps/i);
  });

  it("allows non-overlapping adjacent active ranges", async () => {
    seedWorkerRange(1, 10);
    const token = await adminToken();

    const res = await request(testApp())
      .post("/api/admin/worker-ranges")
      .set("Authorization", token)
      .send({ minWorkers: 11, maxWorkers: 20, basePrice: 2000 });
    expect(res.status).toBe(201);
  });

  it("allows overlap with inactive ranges", async () => {
    seedWorkerRange(1, 10, false); // Inactive range
    const token = await adminToken();

    const res = await request(testApp())
      .post("/api/admin/worker-ranges")
      .set("Authorization", token)
      .send({ minWorkers: 5, maxWorkers: 15, basePrice: 2000 });
    expect(res.status).toBe(201);
  });

  it("only the highest range may have null max (rejects second open-ended range)", async () => {
    seedWorkerRange(100, null); // Range [100, null] already exists
    const token = await adminToken();

    const res = await request(testApp())
      .post("/api/admin/worker-ranges")
      .set("Authorization", token)
      .send({ minWorkers: 200, maxWorkers: null, basePrice: 9000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/highest active range/i);
  });

  it("only the highest range may have null max (rejects open-ended when higher range exists)", async () => {
    seedWorkerRange(100, 200);
    const token = await adminToken();

    const res = await request(testApp())
      .post("/api/admin/worker-ranges")
      .set("Authorization", token)
      .send({ minWorkers: 50, maxWorkers: null, basePrice: 9000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/highest active range/i);
  });

  it("rejects non-admin with 403", async () => {
    const token = await customerToken();
    const res = await request(testApp()).get("/api/admin/worker-ranges").set("Authorization", token);
    expect(res.status).toBe(403);
  });
});

// ─── Locations CRUD ───────────────────────────────────────────────────────────

describe("admin locations CRUD", () => {
  it("creates a location", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/locations")
      .set("Authorization", token)
      .send({ state: "Sindh", city: "Karachi", multiplier: 1.25, cityFee: 750 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      state: "Sindh",
      city: "Karachi",
      multiplier: 1.25,
      cityFee: 750,
      isActive: true,
    });
  });

  it("updates a location", async () => {
    const token = await adminToken();
    const id = crypto.randomUUID();
    fakeDb.locations().seed({ id, state: "Punjab", city: "Rawalpindi", multiplier: "1.1000", cityFee: "300.00", isActive: true });

    const res = await request(testApp())
      .patch(`/api/admin/locations/${id}`)
      .set("Authorization", token)
      .send({ multiplier: 1.35, cityFee: 450 });
    expect(res.status).toBe(200);
    expect(res.body.data.multiplier).toBeCloseTo(1.35);
    expect(res.body.data.cityFee).toBe(450);
  });

  it("deactivates a location (DELETE sets isActive=false)", async () => {
    const token = await adminToken();
    const id = crypto.randomUUID();
    fakeDb.locations().seed({ id, state: "Sindh", city: "Hyderabad", multiplier: "1.0000", cityFee: "0.00", isActive: true });

    const res = await request(testApp()).delete(`/api/admin/locations/${id}`).set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it("fails validation on invalid multiplier", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/locations")
      .set("Authorization", token)
      .send({ state: "Punjab", city: "Multan", multiplier: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects non-admin with 403", async () => {
    const token = await customerToken();
    const res = await request(testApp()).get("/api/admin/locations").set("Authorization", token);
    expect(res.status).toBe(403);
  });
});

// ─── Settings Endpoints ───────────────────────────────────────────────────────

describe("admin settings", () => {
  it("lists settings", async () => {
    seedSetting("currency", "MXN");
    seedSetting("quote_validity_days", 15);
    const token = await adminToken();

    const res = await request(testApp()).get("/api/admin/settings").set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("updates currency with valid 3-letter uppercase code", async () => {
    seedSetting("currency", "MXN");
    const token = await adminToken();

    const res = await request(testApp())
      .put("/api/admin/settings/currency")
      .set("Authorization", token)
      .send({ value: "USD" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ key: "currency", value: "USD" });
  });

  it("rejects invalid currency format", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .put("/api/admin/settings/currency")
      .set("Authorization", token)
      .send({ value: "us" }); // too short
    expect(res.status).toBe(400);

    const lowercase = await request(testApp())
      .put("/api/admin/settings/currency")
      .set("Authorization", token)
      .send({ value: "usd" }); // not uppercase
    expect(lowercase.status).toBe(400);
  });

  it("updates quote_validity_days with integer between 1 and 365", async () => {
    seedSetting("quote_validity_days", 15);
    const token = await adminToken();

    const res = await request(testApp())
      .put("/api/admin/settings/quote_validity_days")
      .set("Authorization", token)
      .send({ value: 60 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ key: "quote_validity_days", value: 60 });
  });

  it("rejects quote_validity_days outside 1–365", async () => {
    const token = await adminToken();
    const zeroRes = await request(testApp())
      .put("/api/admin/settings/quote_validity_days")
      .set("Authorization", token)
      .send({ value: 0 });
    expect(zeroRes.status).toBe(400);

    const tooHighRes = await request(testApp())
      .put("/api/admin/settings/quote_validity_days")
      .set("Authorization", token)
      .send({ value: 366 });
    expect(tooHighRes.status).toBe(400);
  });

  it("rejects non-whitelisted keys", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .put("/api/admin/settings/arbitrary_key")
      .set("Authorization", token)
      .send({ value: "hack" });
    expect(res.status).toBe(400);
  });

  it("records updated_by from the authenticated admin", async () => {
    const admin = await seedUser({ role: UserRole.Admin });
    const token = bearer(mintToken(admin));

    await request(testApp())
      .put("/api/admin/settings/currency")
      .set("Authorization", token)
      .send({ value: "EUR" });

    const row = await fakeDb.appSettings().findOne({ where: { key: "currency" } });
    expect(row?.updatedBy).toBe(admin.id);
  });

  it("rejects non-admin with 403", async () => {
    const token = await customerToken();
    const res = await request(testApp()).get("/api/admin/settings").set("Authorization", token);
    expect(res.status).toBe(403);
  });
});

// ─── Pricing Engine & Integration Tests ───────────────────────────────────────

describe("pricing engine: industry weight and dynamic settings", () => {
  it("weight 1 gives the same total as before", async () => {
    const locationId = crypto.randomUUID();
    const serviceId = crypto.randomUUID();
    const industryId = crypto.randomUUID();

    fakeDb.locations().seed({ id: locationId, state: "Punjab", city: "Lahore", multiplier: "1.2", cityFee: "500", isActive: true });
    fakeDb.services().seed({ id: serviceId, name: "Review", basePrice: "2500", isActive: true });
    fakeDb.workerRanges().seed({ id: crypto.randomUUID(), minWorkers: 1, maxWorkers: 10, basePrice: "10000", isActive: true });
    fakeDb.industries().seed({ id: industryId, name: "Construction", priceWeight: "1.0000", isActive: true });

    const quote = await request(testApp()).post("/api/public/quotations/calculate").send({
      workerCount: 5,
      locationId,
      serviceIds: [serviceId],
      industryId,
    });

    expect(quote.status).toBe(200);
    // workerBasePrice = 10000, locationMultiplier = 1.2, industryWeight = 1
    // workerBase portion = 10000 * 1.2 * 1 = 12000
    // serviceCharges = 2500
    // subtotal = 14500, total = 14500 + 500 = 15000
    expect(quote.body.data.total).toBe(15000);
    expect(quote.body.data.industryWeight).toBe(1);
    expect(quote.body.data.currency).toBe("MXN");
  });

  it("weight 1.2 scales only the worker base portion, not services or city fee", async () => {
    const locationId = crypto.randomUUID();
    const serviceId = crypto.randomUUID();
    const industryId = crypto.randomUUID();

    fakeDb.locations().seed({ id: locationId, state: "Punjab", city: "Lahore", multiplier: "1.2", cityFee: "500", isActive: true });
    fakeDb.services().seed({ id: serviceId, name: "Review", basePrice: "2500", isActive: true });
    fakeDb.workerRanges().seed({ id: crypto.randomUUID(), minWorkers: 1, maxWorkers: 10, basePrice: "10000", isActive: true });
    fakeDb.industries().seed({ id: industryId, name: "Oil & Gas", priceWeight: "1.2000", isActive: true });

    const quote = await request(testApp()).post("/api/public/quotations/calculate").send({
      workerCount: 5,
      locationId,
      serviceIds: [serviceId],
      industryId,
    });

    expect(quote.status).toBe(200);
    // workerBasePrice = 10000 * 1.2 (location) * 1.2 (industry) = 14400
    // serviceCharges = 2500 (unchanged!)
    // subtotal = 14400 + 2500 = 16900
    // total = 16900 + 500 = 17400
    expect(quote.body.data.workerBasePrice).toBe(10000);
    expect(quote.body.data.locationMultiplier).toBe(1.2);
    expect(quote.body.data.industryWeight).toBe(1.2);
    expect(quote.body.data.total).toBe(17400);
    expect(quote.body.data.serviceCharges[0].price).toBe(2500);
  });

  it("currency setting appears in calculate response", async () => {
    seedSetting("currency", "USD");

    const locationId = crypto.randomUUID();
    const industryId = crypto.randomUUID();
    fakeDb.locations().seed({ id: locationId, state: "Punjab", city: "Lahore", multiplier: "1", cityFee: "0", isActive: true });
    fakeDb.workerRanges().seed({ id: crypto.randomUUID(), minWorkers: 1, maxWorkers: 10, basePrice: "1000", isActive: true });
    fakeDb.industries().seed({ id: industryId, name: "Tech", priceWeight: "1.0000", isActive: true });

    const res = await request(testApp()).post("/api/public/quotations/calculate").send({
      workerCount: 5,
      locationId,
      serviceIds: [],
      industryId,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.currency).toBe("USD");
  });

  it("validity setting changes the quote expiry", async () => {
    seedSetting("quote_validity_days", 7);
    seedSetting("currency", "USD");

    const locationId = crypto.randomUUID();
    const industryId = crypto.randomUUID();
    fakeDb.locations().seed({ id: locationId, state: "Punjab", city: "Lahore", multiplier: "1", cityFee: "0", isActive: true });
    fakeDb.workerRanges().seed({ id: crypto.randomUUID(), minWorkers: 1, maxWorkers: 10, basePrice: "1000", isActive: true });
    fakeDb.industries().seed({ id: industryId, name: "Tech", priceWeight: "1.0000", isActive: true });

    const customer = await seedUser({ role: UserRole.Customer });
    const now = Date.now();

    const res = await request(testApp())
      .post("/api/customers/me/quotations")
      .set("Authorization", bearer(mintToken(customer)))
      .send({ workerCount: 5, locationId, serviceIds: [], industryId });

    expect(res.status).toBe(200);
    const expiresAt = new Date(res.body.data.expiresAt).getTime();
    // Expiry should be approximately 7 days from now (± 5 seconds)
    const expectedExpiry = now + 7 * 86_400_000;
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
  });

  it("uses currency setting in quotation Sent email instead of PKR", async () => {
    seedSetting("currency", "EUR");

    const customer = await seedUser({ role: UserRole.Customer, email: "client.eur@test.com" });
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.eur@test.com" });
    const quotationId = crypto.randomUUID();

    fakeDb.quotations().seed({
      id: quotationId,
      customerId: customer.id,
      industryId: crypto.randomUUID(),
      locationId: crypto.randomUUID(),
      workerCount: 5,
      totalPrice: "8500.00",
      status: "draft",
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
      .patch(`/api/agent/quotations/${quotationId}/status`)
      .set("Authorization", bearer(mintToken(manager)))
      .send({ status: "sent", note: "Ready" });

    expect(response.status).toBe(200);

    const { outbox } = await import("./support/email.fake");
    const sentEmail = outbox.find((msg) => msg.to === customer.email);
    expect(sentEmail).toBeDefined();
    expect(sentEmail?.text).toContain("Total: EUR 8500.00.");
  });
});
