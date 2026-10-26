import request from "supertest";
import { DocumentStatus } from "../src/modules/documents/document-status";
import { QuotationStatus } from "../src/modules/quotations/quotation-status";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, fakeDb, mintToken, resetTestState, seedDocument, seedUser, testApp } from "./support/harness";
import { queuedEmails } from "./support/email-queue.fake";

beforeEach(() => resetTestState());

/**
 * `resolveWebUrl` reads the validated config, which is frozen when config/env is
 * first imported. Each case therefore re-imports the module under a fresh
 * process.env inside `jest.isolateModules`, rather than mutating a value the rest
 * of the suite depends on.
 */
function resolveWith(overrides: { WEB_URL?: string; CORS_ORIGIN?: string }): string | null {
  const previous = { WEB_URL: process.env.WEB_URL, CORS_ORIGIN: process.env.CORS_ORIGIN };
  if ("WEB_URL" in overrides) {
    if (overrides.WEB_URL === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = overrides.WEB_URL;
  }
  if ("CORS_ORIGIN" in overrides) {
    if (overrides.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = overrides.CORS_ORIGIN;
  }

  let result: string | null = null;
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      result = (require("../src/utils/web-url") as typeof import("../src/utils/web-url")).resolveWebUrl();
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  return result;
}

describe("resolveWebUrl", () => {
  it("prefers WEB_URL and strips trailing slashes", () => {
    expect(resolveWith({ WEB_URL: "https://portal.example.com///" })).toBe("https://portal.example.com");
  });

  it("falls back to the first CORS_ORIGIN entry when WEB_URL is unset", () => {
    expect(
      resolveWith({ WEB_URL: undefined, CORS_ORIGIN: "https://first.example.com/, https://second.example.com" }),
    ).toBe("https://first.example.com");
  });

  it("returns null when WEB_URL is unset and the only origin is a wildcard", () => {
    // A wildcard is not a destination. Returning it would put "*/dashboard/..."
    // into an email; null lets the caller emit a bare path instead.
    expect(resolveWith({ WEB_URL: undefined, CORS_ORIGIN: "*" })).toBeNull();
  });
});

describe("links inside outgoing email are absolute and point at real portal routes", () => {
  it("sends an absolute /dashboard/documents link when a document is approved", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "customer.weburl@test.com" });
    const admin = await seedUser({ role: UserRole.Admin, email: "admin.weburl@test.com" });
    const document = seedDocument(customer.id, DocumentStatus.UnderReview);

    const response = await request(testApp())
      .patch(`/api/documents/${document.id}/status`)
      .set("Authorization", bearer(mintToken(admin)))
      .send({ toStatus: DocumentStatus.Approved });

    expect(response.status).toBe(200);
    expect(queuedEmails).toHaveLength(1);

    const documentUrl = queuedEmails[0].data.documentUrl as string;
    // The bug this guards: a raw process.env read produced "/portal/documents" —
    // a relative path, and to a route the customer portal does not even have.
    expect(documentUrl).toMatch(/^https?:\/\//);
    expect(documentUrl.endsWith("/dashboard/documents")).toBe(true);
    expect(documentUrl).not.toContain("/portal/");
  });

  it("sends a portalUrl with no trailing slash when a quotation is sent", async () => {
    const customer = await seedUser({ role: UserRole.Customer, email: "customer.weburl2@test.com" });
    const manager = await seedUser({ role: UserRole.Manager, email: "manager.weburl@test.com" });
    const quotationId = "33333333-3333-4333-8333-333333333333";

    fakeDb.quotations().seed({
      id: quotationId,
      customerId: customer.id,
      industryId: "industry-1",
      locationId: "location-1",
      workerCount: 4,
      totalPrice: "9000.00",
      status: QuotationStatus.Draft,
      expiresAt: new Date(Date.now() + 86_400_000),
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
      .send({ status: QuotationStatus.Sent });

    expect(response.status).toBe(200);
    expect(queuedEmails).toHaveLength(1);

    const portalUrl = queuedEmails[0].data.portalUrl as string;
    expect(portalUrl).toBeTruthy();
    expect(portalUrl).toMatch(/^https?:\/\//);
    // Templates append "/dashboard/quotations", so a trailing slash here would
    // render as "//dashboard/quotations".
    expect(portalUrl.endsWith("/")).toBe(false);
  });
});
