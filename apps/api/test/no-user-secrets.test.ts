import crypto from "crypto";
import request from "supertest";
import { QuotationStatus } from "../src/modules/quotations/quotation-status";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedAssignment, seedUser, testApp, type SeededUser } from "./support/harness";

/**
 * No response may carry a user's password hash or session-invalidation timestamp.
 *
 * Every endpoint that returns a quotation is listed, because quotations embed their
 * customer. The fake DB hydrates `relations: { customer: true }` from the users
 * table (see test/support/database.fake.ts), so these fail if a service returns the
 * raw relation.
 */

beforeEach(() => resetTestState());

interface Context {
  admin: SeededUser;
  manager: SeededUser;
  agent: SeededUser;
  customer: SeededUser;
  pricing: { industryId: string; locationId: string; serviceId: string };
  quotationId: string;
}

async function seedContext(status: QuotationStatus): Promise<Context> {
  const pricing = { industryId: crypto.randomUUID(), locationId: crypto.randomUUID(), serviceId: crypto.randomUUID() };
  fakeDb.locations().seed({ id: pricing.locationId, state: "Nuevo León", city: "Monterrey", multiplier: "1.1", cityFee: "3000", isActive: true });
  fakeDb.services().seed({ id: pricing.serviceId, name: "Permit Consultation", description: null, basePrice: "2500", isActive: true });
  fakeDb.workerRanges().seed({ id: crypto.randomUUID(), minWorkers: 1, maxWorkers: null, basePrice: "10000", isActive: true });
  fakeDb.industries().seed({ id: pricing.industryId, name: "Construction", description: null, priceWeight: "1", isActive: true });

  const customer = await seedUser({ role: UserRole.Customer });
  const quotationId = crypto.randomUUID();
  fakeDb.quotations().seed({
    id: quotationId,
    customerId: customer.id,
    industryId: pricing.industryId,
    locationId: pricing.locationId,
    workerCount: 5,
    totalPrice: "14000.00",
    currency: "MXN",
    status,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: null,
    acceptedAt: null,
    rejectionReason: null,
    items: [],
  });

  const agent = await seedUser({ role: UserRole.Agent });
  // The agent quotation list is scoped to assigned customers, so this fixture has
  // to make the agent responsible for the customer it then reads back.
  seedAssignment(agent.id, customer.id);

  return {
    admin: await seedUser({ role: UserRole.Admin }),
    manager: await seedUser({ role: UserRole.Manager }),
    agent,
    customer,
    pricing,
    quotationId,
  };
}

const staffCreateBody = (ctx: Context) => ({
  customerId: ctx.customer.id,
  industryId: ctx.pricing.industryId,
  locationId: ctx.pricing.locationId,
  workerCount: 5,
  serviceIds: [ctx.pricing.serviceId],
});

type Case = [string, QuotationStatus, (ctx: Context) => request.Test];

const cases: Case[] = [
  ["GET /api/admin/quotations", QuotationStatus.Draft, (ctx) =>
    request(testApp()).get("/api/admin/quotations").set("Authorization", bearer(mintToken(ctx.admin)))],
  ["GET /api/admin/quotations/:id", QuotationStatus.Draft, (ctx) =>
    request(testApp()).get(`/api/admin/quotations/${ctx.quotationId}`).set("Authorization", bearer(mintToken(ctx.admin)))],
  ["PATCH /api/admin/quotations/:id/status", QuotationStatus.Draft, (ctx) =>
    request(testApp()).patch(`/api/admin/quotations/${ctx.quotationId}/status`).set("Authorization", bearer(mintToken(ctx.admin))).send({ status: "sent" })],
  ["POST /api/admin/quotations", QuotationStatus.Draft, (ctx) =>
    request(testApp()).post("/api/admin/quotations").set("Authorization", bearer(mintToken(ctx.admin))).send(staffCreateBody(ctx))],
  ["GET /api/agent/quotations", QuotationStatus.Draft, (ctx) =>
    request(testApp()).get("/api/agent/quotations").set("Authorization", bearer(mintToken(ctx.agent)))],
  ["GET /api/agent/quotations/:id", QuotationStatus.Draft, (ctx) =>
    request(testApp()).get(`/api/agent/quotations/${ctx.quotationId}`).set("Authorization", bearer(mintToken(ctx.agent)))],
  ["PATCH /api/agent/quotations/:id/status", QuotationStatus.Draft, (ctx) =>
    request(testApp()).patch(`/api/agent/quotations/${ctx.quotationId}/status`).set("Authorization", bearer(mintToken(ctx.manager))).send({ status: "sent" })],
  ["POST /api/agent/quotations", QuotationStatus.Draft, (ctx) =>
    request(testApp()).post("/api/agent/quotations").set("Authorization", bearer(mintToken(ctx.agent))).send(staffCreateBody(ctx))],
  ["GET /api/customers/me/quotations", QuotationStatus.Draft, (ctx) =>
    request(testApp()).get("/api/customers/me/quotations").set("Authorization", bearer(mintToken(ctx.customer)))],
  ["GET /api/customers/me/quotations/:id", QuotationStatus.Draft, (ctx) =>
    request(testApp()).get(`/api/customers/me/quotations/${ctx.quotationId}`).set("Authorization", bearer(mintToken(ctx.customer)))],
  ["POST /api/customers/me/quotations", QuotationStatus.Draft, (ctx) =>
    request(testApp()).post("/api/customers/me/quotations").set("Authorization", bearer(mintToken(ctx.customer)))
      .send({ workerCount: 5, locationId: ctx.pricing.locationId, industryId: ctx.pricing.industryId, serviceIds: [ctx.pricing.serviceId] })],
  ["POST /api/customers/me/quotations/:id/accept", QuotationStatus.Sent, (ctx) =>
    request(testApp()).post(`/api/customers/me/quotations/${ctx.quotationId}/accept`).set("Authorization", bearer(mintToken(ctx.customer)))],
  ["POST /api/customers/me/quotations/:id/reject", QuotationStatus.Sent, (ctx) =>
    request(testApp()).post(`/api/customers/me/quotations/${ctx.quotationId}/reject`).set("Authorization", bearer(mintToken(ctx.customer))).send({ reason: "Too expensive" })],
  ["GET /api/quotations/:id", QuotationStatus.Draft, (ctx) =>
    request(testApp()).get(`/api/quotations/${ctx.quotationId}`).set("Authorization", bearer(mintToken(ctx.customer)))],
];

describe("responses never expose user secrets", () => {
  it.each(cases)("%s", async (_name, status, send) => {
    const ctx = await seedContext(status);

    const res = await send(ctx);

    expect(res.status).toBeLessThan(300);
    const body = JSON.stringify(res.body);
    expect(body).toContain(ctx.customer.email);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("tokensValidFrom");
  });
});
