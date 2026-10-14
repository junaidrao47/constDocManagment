import request from "supertest";
import { QuotationStatus } from "../src/modules/quotations/quotation-status";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

let seedCounter = 0;

function seedQuotation(customerId: string, overrides: Record<string, unknown> = {}) {
  seedCounter += 1;
  const id = (overrides.id as string) ?? `quotation-${seedCounter}`;
  fakeDb.quotations().seed({
    id,
    customerId,
    industryId: "industry-1",
    locationId: "location-1",
    workerCount: 5,
    totalPrice: "10000.00",
    currency: "MXN",
    status: QuotationStatus.Draft,
    // Far future, so lazy expiry never fires and row counts stay deterministic.
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: null,
    acceptedAt: null,
    rejectionReason: null,
    items: [],
    ...overrides,
  });
  return id;
}

describe("quotation lists stay a bare array unless pagination is requested", () => {
  it.each([
    ["admin", UserRole.Admin, "/api/admin/quotations"],
    ["agent", UserRole.Agent, "/api/agent/quotations"],
    ["customer", UserRole.Customer, "/api/customers/me/quotations"],
  ])("returns a bare array for %s with no query parameters", async (label, role, path) => {
    const customer = await seedUser({ role: UserRole.Customer, email: `cust.bare.${label}@test.com` });
    const caller =
      role === UserRole.Customer ? customer : await seedUser({ role, email: `caller.bare.${label}@test.com` });
    seedQuotation(customer.id);

    const response = await request(testApp()).get(path).set("Authorization", bearer(mintToken(caller)));

    expect(response.status).toBe(200);
    // Three frontend pages type this as Quotation[]; wrapping it unconditionally
    // would break all of them.
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
  });
});

describe("opt-in pagination", () => {
  it("wraps the result and reports totals when page and pageSize are given", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.page@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.page@test.com" });
    seedQuotation(customer.id, { id: "p-1", createdAt: new Date("2026-01-01") });
    seedQuotation(customer.id, { id: "p-2", createdAt: new Date("2026-01-02") });
    seedQuotation(customer.id, { id: "p-3", createdAt: new Date("2026-01-03") });

    const response = await request(testApp())
      .get("/api/admin/quotations?page=2&pageSize=1")
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(200);
    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.pagination).toEqual({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
  });

  it("accepts limit as an alias for pageSize", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.limit@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.limit@test.com" });
    seedQuotation(customer.id);
    seedQuotation(customer.id);

    const response = await request(testApp())
      .get("/api/admin/quotations?limit=1")
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(200);
    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2 });
  });

  it("lets pageSize win when both pageSize and limit are given", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.both@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.both@test.com" });
    seedQuotation(customer.id);
    seedQuotation(customer.id);
    seedQuotation(customer.id);

    const response = await request(testApp())
      .get("/api/admin/quotations?limit=5&pageSize=1")
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(200);
    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.pagination.pageSize).toBe(1);
  });
});

describe("list query validation", () => {
  it.each([
    ["pageSize above the ceiling", "?pageSize=101", "a"],
    ["page below one", "?page=0", "b"],
    ["an unmapped sort key", "?sort=hax", "c"],
    ["an unknown status", "?status=not_a_status", "d"],
  ])("rejects %s with 400", async (_label, query, tag) => {
    const admin = await seedUser({ role: UserRole.Admin, email: `admin.bad.${tag}@test.com` });

    const response = await request(testApp())
      .get(`/api/admin/quotations${query}`)
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(400);
  });

  it("sorts by totalPrice in both directions", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.sort@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.sort@test.com" });
    seedQuotation(customer.id, { id: "cheap", totalPrice: "100.00" });
    seedQuotation(customer.id, { id: "dear", totalPrice: "900.00" });

    const ascending = await request(testApp())
      .get("/api/admin/quotations?sort=totalPrice&page=1")
      .set("Authorization", bearer(mintToken(admin)));
    const descending = await request(testApp())
      .get("/api/admin/quotations?sort=-totalPrice&page=1")
      .set("Authorization", bearer(mintToken(admin)));

    expect(ascending.body.data.data.map((row: { id: string }) => row.id)).toEqual(["cheap", "dear"]);
    expect(descending.body.data.data.map((row: { id: string }) => row.id)).toEqual(["dear", "cheap"]);
  });
});

describe("ownership survives pagination", () => {
  it("shows a customer only their own rows, on both the bare and paginated paths", async () => {
    const mine = await seedUser({ role: UserRole.Customer, email: "mine.own@test.com" });
    const theirs = await seedUser({ role: UserRole.Customer, email: "theirs.own@test.com" });
    seedQuotation(mine.id, { id: "mine-1" });
    seedQuotation(theirs.id, { id: "theirs-1" });
    seedQuotation(theirs.id, { id: "theirs-2" });
    const token = bearer(mintToken(mine));

    const bare = await request(testApp()).get("/api/customers/me/quotations").set("Authorization", token);
    expect(bare.body.data.map((row: { id: string }) => row.id)).toEqual(["mine-1"]);

    const paged = await request(testApp())
      .get("/api/customers/me/quotations?page=1&pageSize=50")
      .set("Authorization", token);
    // The filter must narrow `total`, not just the slice: a total of 3 here would
    // disclose how many quotations another customer has.
    expect(paged.body.data.pagination.total).toBe(1);
    expect(paged.body.data.data.map((row: { id: string }) => row.id)).toEqual(["mine-1"]);
  });

  it("keeps the per-row shape identical on the paginated path", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.shape@test.com" });
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.shape@test.com" });
    // Items are seeded inline on the quotation row: the fake repository only
    // resolves relations registered with defineRelation, and `items` is not one,
    // so a separately seeded quotation_items row would never be joined.
    seedQuotation(customer.id, {
      id: "shape-1",
      items: [
        {
          id: "item-1",
          quotationId: "shape-1",
          serviceId: null,
          kind: "worker_base",
          label: "Worker base",
          quantity: 1,
          price: "10000.00",
          unitPrice: "10000.00",
          lineTotal: "10000.00",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const response = await request(testApp())
      .get("/api/admin/quotations?page=1")
      .set("Authorization", bearer(mintToken(admin)));

    const row = response.body.data.data[0];
    expect(row.items[0]).toMatchObject({ unitPrice: "10000.00", lineTotal: "10000.00" });
    // withPublicCustomer must still run: the loaded relation carries passwordHash.
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("tokensValidFrom");
  });
});
