import request from "supertest";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

let packageCounter = 0;

function seedPackage(overrides: Record<string, unknown> = {}) {
  packageCounter += 1;
  const id = (overrides.id as string) ?? `package-${packageCounter}`;
  fakeDb.packages().seed({
    id,
    name: `Package ${packageCounter}`,
    type: "standard",
    price: "5000.00",
    durationDays: 365,
    description: null,
    isActive: true,
    isFeatured: false,
    sortOrder: 0,
    services: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return id;
}

function seedService(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) ?? "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  fakeDb.services().seed({
    id,
    name: "Compliance review",
    description: null,
    basePrice: "1500.00",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return id;
}

describe("public package visibility", () => {
  it("omits a retired package from the public list", async () => {
    seedPackage({ id: "live", name: "Live package" });
    seedPackage({ id: "retired", name: "Retired package", isActive: false });

    const response = await request(testApp()).get("/api/public/packages");

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual(["live"]);
  });

  it("orders featured first, then by sortOrder, then by name", async () => {
    seedPackage({ id: "plain-b", name: "B plain", sortOrder: 5 });
    seedPackage({ id: "plain-a", name: "A plain", sortOrder: 5 });
    seedPackage({ id: "early", name: "Z early", sortOrder: 1 });
    seedPackage({ id: "starred", name: "Z starred", isFeatured: true, sortOrder: 9 });

    const response = await request(testApp()).get("/api/public/packages");

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([
      "starred",
      "early",
      "plain-a",
      "plain-b",
    ]);
  });

  it("exposes the description on the public list", async () => {
    seedPackage({ id: "described", description: "Everything a mid-size contractor needs." });

    const response = await request(testApp()).get("/api/public/packages");

    expect(response.body.data[0]).toMatchObject({
      description: "Everything a mid-size contractor needs.",
      isFeatured: false,
    });
  });
});

describe("admin package management", () => {
  it("includes retired packages, which the public list hides", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.pkg.list@test.com" });
    seedPackage({ id: "live-2", name: "Live two" });
    seedPackage({ id: "retired-2", name: "Retired two", isActive: false });

    const response = await request(testApp())
      .get("/api/admin/packages")
      .set("Authorization", bearer(mintToken(admin)));

    expect(response.status).toBe(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain("live-2");
    // An admin must be able to see what they retired in order to bring it back.
    expect(ids).toContain("retired-2");
  });

  it("round-trips description, sortOrder and isFeatured through create and fetch", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.pkg.create@test.com" });
    const serviceId = seedService();

    const created = await request(testApp())
      .post("/api/admin/packages")
      .set("Authorization", bearer(mintToken(admin)))
      .send({
        name: "Premium compliance",
        type: "premium",
        price: 25000,
        durationDays: 365,
        serviceIds: [serviceId],
        description: "Full coverage, priority review.",
        sortOrder: 3,
        isFeatured: true,
      });

    expect(created.status).toBe(201);

    const fetched = await request(testApp())
      .get(`/api/admin/packages/${created.body.data.id}`)
      .set("Authorization", bearer(mintToken(admin)));

    expect(fetched.status).toBe(200);
    expect(fetched.body.data).toMatchObject({
      description: "Full coverage, priority review.",
      sortOrder: 3,
      isFeatured: true,
      isActive: true,
    });
  });

  it("ignores a client-supplied active flag and leaves the package active", async () => {
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.pkg.sneaky@test.com" });
    const serviceId = seedService({ id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb" });

    const created = await request(testApp())
      .post("/api/admin/packages")
      .set("Authorization", bearer(mintToken(admin)))
      .send({
        name: "Sneaky package",
        type: "basic",
        price: 1000,
        durationDays: 30,
        serviceIds: [serviceId],
        isActive: false,
      });

    expect(created.status).toBe(201);
    // The field is not in PackageSchema, so zod strips it; the entity default wins.
    expect(created.body.data.isActive).toBe(true);

    const publicList = await request(testApp()).get("/api/public/packages");
    expect(publicList.body.data.map((row: { id: string }) => row.id)).toContain(created.body.data.id);
  });
});
