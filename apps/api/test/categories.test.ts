import crypto from "crypto";
import request from "supertest";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

async function adminToken() {
  const admin = await seedUser({ role: UserRole.Admin });
  return bearer(mintToken(admin));
}

function seedCategory(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) ?? crypto.randomUUID();
  fakeDb.categories().seed({
    id,
    slug: (overrides.slug as string) ?? `cat-${id.slice(0, 8)}`,
    nameEn: "Name EN",
    nameEs: "Nombre ES",
    descriptionEn: null,
    descriptionEs: null,
    icon: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return id;
}

describe("admin categories CRUD", () => {
  it("creates a category", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/categories")
      .set("Authorization", token)
      .send({ slug: "compliance", nameEn: "Compliance", nameEs: "Cumplimiento", icon: "shield" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ slug: "compliance", nameEn: "Compliance", nameEs: "Cumplimiento", isActive: true, sortOrder: 0 });
  });

  it("rejects a duplicate slug with CONFLICT", async () => {
    const token = await adminToken();
    seedCategory({ slug: "compliance" });
    const res = await request(testApp())
      .post("/api/admin/categories")
      .set("Authorization", token)
      .send({ slug: "compliance", nameEn: "Compliance", nameEs: "Cumplimiento" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects a malformed slug with VALIDATION_FAILED", async () => {
    const token = await adminToken();
    const res = await request(testApp())
      .post("/api/admin/categories")
      .set("Authorization", token)
      .send({ slug: "Not A Slug", nameEn: "X", nameEs: "X" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("reorders categories by position", async () => {
    const token = await adminToken();
    const a = seedCategory({ slug: "a", sortOrder: 0 });
    const b = seedCategory({ slug: "b", sortOrder: 1 });
    const c = seedCategory({ slug: "c", sortOrder: 2 });

    const res = await request(testApp())
      .post("/api/admin/categories/reorder")
      .set("Authorization", token)
      .send({ orderedIds: [c, a, b] });
    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual([c, a, b]);
    expect(res.body.data.map((row: { sortOrder: number }) => row.sortOrder)).toEqual([0, 1, 2]);
  });

  it("deactivates a category through the status route", async () => {
    const token = await adminToken();
    const id = seedCategory({ slug: "toggle" });
    const res = await request(testApp())
      .patch(`/api/admin/categories/${id}/status`)
      .set("Authorization", token)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it("deletes an empty category", async () => {
    const token = await adminToken();
    const id = seedCategory({ slug: "empty" });
    const res = await request(testApp()).delete(`/api/admin/categories/${id}`).set("Authorization", token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, deleted: true });
  });

  it("refuses to delete a category that still has a service (CATEGORY_NOT_EMPTY)", async () => {
    const token = await adminToken();
    const id = seedCategory({ slug: "in-use" });
    fakeDb.services().seed({ id: crypto.randomUUID(), name: "S", nameEn: "S", nameEs: "S", basePrice: "100", isActive: true, categoryId: id });

    const res = await request(testApp()).delete(`/api/admin/categories/${id}`).set("Authorization", token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_NOT_EMPTY");
  });

  it("forbids a non-admin", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "cust.cat@test.com" });
    const res = await request(testApp())
      .get("/api/admin/categories")
      .set("Authorization", bearer(mintToken(customer)));
    expect(res.status).toBe(403);
  });
});

describe("public categories and localization", () => {
  it("lists only active categories with service/package counts", async () => {
    const active = seedCategory({ slug: "active", nameEn: "Active", nameEs: "Activa" });
    seedCategory({ slug: "hidden", isActive: false });
    fakeDb.services().seed({ id: crypto.randomUUID(), name: "S1", nameEn: "S1", nameEs: "S1", basePrice: "100", isActive: true, categoryId: active });
    fakeDb.packages().seed({ id: crypto.randomUUID(), name: "P1", nameEn: "P1", nameEs: "P1", type: "x", price: "1", durationDays: 1, isActive: true, isFeatured: false, sortOrder: 0, services: [], categoryId: active });

    const res = await request(testApp()).get("/api/public/categories");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ slug: "active", serviceCount: 1, packageCount: 1 });
  });

  it("filters public services by category slug and localizes by Accept-Language", async () => {
    const cat = seedCategory({ slug: "docs", nameEn: "Docs", nameEs: "Documentos" });
    const other = seedCategory({ slug: "other", nameEn: "Other", nameEs: "Otro" });
    fakeDb.services().seed({ id: "s-in", name: "In", nameEn: "Permit", nameEs: "Permiso", descriptionEn: "d-en", descriptionEs: "d-es", basePrice: "100", isActive: true, categoryId: cat });
    fakeDb.services().seed({ id: "s-out", name: "Out", nameEn: "Other svc", nameEs: "Otro svc", basePrice: "100", isActive: true, categoryId: other });

    const es = await request(testApp()).get("/api/public/services?category=docs");
    expect(es.status).toBe(200);
    expect(es.body.data).toHaveLength(1);
    expect(es.body.data[0]).toMatchObject({ id: "s-in", name: "Permiso", description: "d-es" });
    expect(es.body.data[0].category).toMatchObject({ slug: "docs", name: "Documentos" });

    const en = await request(testApp()).get("/api/public/services?category=docs").set("Accept-Language", "en-US,en;q=0.9");
    expect(en.body.data[0]).toMatchObject({ name: "Permit", description: "d-en" });
    expect(en.body.data[0].category).toMatchObject({ name: "Docs" });
  });
});
