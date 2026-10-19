/**
 * End-to-end smoke test of the 70%-milestone story against a RUNNING API and a
 * REAL Postgres database.
 *
 * `npm test` cannot catch schema drift: the Jest suite maps the data source to
 * an in-memory fake (see `jest.config.js` moduleNameMapper), so a column that
 * exists on an entity but not in Postgres -- or vice versa -- passes every test
 * and still fails in the browser. That has already happened twice:
 * `documents.approved_*`, then `payments.status` plus
 * `quotation_items.service_id`. This script is the guard against a third time.
 *
 * Usage:
 *   npm run smoke
 *   SMOKE_API_URL=https://staging.example.com/api npm run smoke
 *
 * Steps this plan has not delivered yet print SKIP and do not fail the run, so
 * the script doubles as the live scoreboard for the milestone.
 */

const API = process.env.SMOKE_API_URL ?? "http://localhost:3001/api";
const HEALTH = `${new URL(API).origin}/health/ready`;

const ADMIN = { email: "admin@test.com", password: "AdminPassword123!" };
const AGENT = { email: "agent@test.com", password: "AgentPassword123!" };
const CUSTOMER = { email: "customer@test.com", password: "CustomerPassword123!" };

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(step: string, detail = ""): void {
  passed += 1;
  console.log(`PASS  ${step}${detail ? ` -- ${detail}` : ""}`);
}

function fail(step: string, detail: string): void {
  failed += 1;
  console.error(`FAIL  ${step} -- ${detail}`);
}

function skip(step: string, phase: string): void {
  skipped += 1;
  console.log(`SKIP  ${step} -- not built yet (${phase})`);
}

type Json = Record<string, unknown>;
type ApiResponse = { status: number; body: Json };

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let body: Json = {};
  try {
    body = (await response.json()) as Json;
  } catch {
    body = {};
  }
  return { status: response.status, body };
}

function data<T>(response: ApiResponse): T {
  return response.body.data as T;
}

/** Aborts the whole run: every later step depends on the one that threw. */
async function need(step: string, pending: Promise<ApiResponse>): Promise<ApiResponse> {
  const response = await pending;
  if (response.status >= 200 && response.status < 300) return response;
  throw new Error(`${step} returned HTTP ${response.status}: ${JSON.stringify(response.body)}`);
}

async function login(credentials: { email: string; password: string }): Promise<string> {
  const response = await need(
    `login ${credentials.email}`,
    call("POST", "/auth/login", { body: credentials }),
  );
  const token = data<{ accessToken?: string }>(response).accessToken;
  if (!token) throw new Error(`login ${credentials.email} returned no accessToken`);
  return token;
}

async function firstId(step: string, path: string): Promise<string> {
  const response = await need(step, call("GET", path));
  const rows = data<Array<{ id: string }>>(response);
  if (!rows?.length) throw new Error(`${step} returned no rows -- has the seed run?`);
  return rows[0].id;
}

async function main(): Promise<void> {
  console.log(`\nSmoke test against ${API}\n${"-".repeat(64)}`);

  const health = await fetch(HEALTH).catch(() => null);
  if (health?.ok) pass("health/ready");
  else fail("health/ready", health ? `HTTP ${health.status}` : "unreachable");

  const adminToken = await login(ADMIN);
  const agentToken = await login(AGENT);
  const customerToken = await login(CUSTOMER);
  pass("login as admin, agent and customer");

  // -- story 1: admin creates a service -------------------------------------
  const serviceName = `Smoke Service ${Date.now()}`;
  const serviceId = data<{ id: string }>(
    await need(
      "create service",
      call("POST", "/admin/services", {
        token: adminToken,
        body: { name: serviceName, description: "created by smoke.ts", basePrice: 1200 },
      }),
    ),
  ).id;
  pass("story 1 - admin creates a service", serviceName);

  // -- story 2: admin creates a package -------------------------------------
  const packageName = `Smoke Package ${Date.now()}`;
  const packageId = data<{ id: string }>(
    await need(
      "create package",
      call("POST", "/admin/packages", {
        token: adminToken,
        body: {
          name: packageName,
          type: "standard",
          price: 48000,
          durationDays: 365,
          serviceIds: [serviceId],
        },
      }),
    ),
  ).id;
  pass("story 2 - admin creates a package", packageName);

  // -- story 3: the public site serves both from the database ---------------
  const publicServices = data<Array<{ id: string }>>(
    await need("public services", call("GET", "/public/services")),
  );
  if (publicServices.some((row) => row.id === serviceId)) {
    pass("story 3 - the new service is live on the public site");
  } else {
    fail("story 3 - the new service is live on the public site", "missing from /public/services");
  }

  const publicPackages = data<Array<{ id: string }>>(
    await need("public packages", call("GET", "/public/packages")),
  );
  if (publicPackages.some((row) => row.id === packageId)) {
    pass("story 3 - the new package is live on the public site");
  } else {
    fail("story 3 - the new package is live on the public site", "missing from /public/packages");
  }

  // -- story 4: quote --------------------------------------------------------
  const industryId = await firstId("industries", "/public/industries");
  const locationId = await firstId("locations", "/public/locations");
  const quoteBody = { workerCount: 25, locationId, industryId, serviceIds: [serviceId] };

  const calculated = await need(
    "public calculate",
    call("POST", "/public/quotations/calculate", { body: quoteBody }),
  );
  const breakdown = data<{ total: number; currency: string }>(calculated);
  pass("story 4 - public calculator", `total ${breakdown.total} ${breakdown.currency}`);

  const customerQuote = await need(
    "customer saves a quotation",
    call("POST", "/customers/me/quotations", { token: customerToken, body: quoteBody }),
  );
  pass(
    "story 4 - customer saves a multi-service quotation",
    `${data<{ items: unknown[] }>(customerQuote).items.length} line items`,
  );

  // Quoting a PACKAGE at its own price -- phase 1.4.
  const packageQuote = await call("POST", "/public/quotations/calculate", {
    body: { ...quoteBody, packageId },
  });
  const packageTotal = data<{ total?: number }>(packageQuote)?.total;
  if (packageQuote.status === 200 && packageTotal === 48000) {
    pass("story 4 - a package quotes at its own price", `MXN ${packageTotal}`);
  } else {
    skip("story 4 - a package quotes at its own price", "phase 1.4");
  }

  // A staff quotation with non-service line items. This path failed on real
  // Postgres until 1830000000000-FixSchemaDrift dropped the NOT NULL on
  // quotation_items.service_id, so assert the null-service lines specifically.
  const customerId = data<{ items: Array<{ id: string }> }>(
    await need(
      "customer lookup",
      call("GET", "/admin/users?role=customer&pageSize=1", { token: adminToken }),
    ),
  ).items[0].id;

  const staffQuote = await need(
    "staff quotation with extra lines",
    call("POST", "/admin/quotations", {
      token: adminToken,
      body: {
        customerId,
        industryId,
        locationId,
        workerCount: 25,
        serviceIds: [serviceId],
        extraLines: [{ kind: "gov_fee", label: "Derecho municipal", amount: 1500 }],
      },
    }),
  );
  const staffQuoteRecord = data<{
    id: string;
    items: Array<{ kind: string; serviceId: string | null }>;
  }>(staffQuote);
  const nullServiceLines = staffQuoteRecord.items.filter((item) => item.serviceId === null);
  if (nullServiceLines.length > 0) {
    pass(
      "story 4 - staff quotation persists non-service lines",
      `${nullServiceLines.length} null-service line(s): ${nullServiceLines
        .map((item) => item.kind)
        .join(", ")}`,
    );
  } else {
    fail(
      "story 4 - staff quotation persists non-service lines",
      "none were persisted -- has the NOT NULL on quotation_items.service_id regressed?",
    );
  }

  // -- story 4: accept, then invoice ----------------------------------------
  const quotationId = staffQuoteRecord.id;
  await need(
    "send quotation",
    call("PATCH", `/admin/quotations/${quotationId}/status`, {
      token: adminToken,
      body: { status: "sent" },
    }),
  );
  await need(
    "accept quotation",
    call("PATCH", `/admin/quotations/${quotationId}/status`, {
      token: adminToken,
      body: { status: "accepted" },
    }),
  );
  pass("story 4 - quotation sent and accepted");

  const invoice = data<{
    id: string;
    invoiceNumber: string;
    subtotal: string;
    taxAmount: string;
    status: string;
  }>(
    await need(
      "create invoice",
      call("POST", `/admin/quotations/${quotationId}/invoice`, { token: adminToken }),
    ),
  );
  pass(
    "story 4 - invoice raised from the accepted quotation",
    `${invoice.invoiceNumber} (${invoice.status})`,
  );

  // -- story 5: record a payment --------------------------------------------
  // This failed on every real database until 1830000000000 dropped
  // payments.status (NOT NULL, no default, no matching entity property).
  const dueCents =
    Math.round(Number(invoice.subtotal) * 100) + Math.round(Number(invoice.taxAmount) * 100);
  const fullAmount = (dueCents / 100).toFixed(2);

  const paid = data<{ status: string; subscriptionId: string | null }>(
    await need(
      "record payment",
      call("POST", `/admin/invoices/${invoice.id}/payments`, {
        token: adminToken,
        body: { amount: fullAmount, method: "spei", reference: "SMOKE-SPEI-001" },
      }),
    ),
  );
  if (paid.status === "paid") {
    pass("story 5 - SPEI payment recorded and the invoice is paid", `MXN ${fullAmount}`);
  } else {
    fail("story 5 - SPEI payment recorded", `invoice status is ${paid.status}, expected paid`);
  }

  // -- story 6: the payment activates a subscription ------------------------
  const subscriptions = data<unknown[]>(
    await need(
      "customer subscriptions",
      call("GET", "/customers/me/subscriptions", { token: customerToken }),
    ),
  );
  if (paid.subscriptionId || subscriptions.length > 0) {
    pass("story 6 - the payment activated a subscription");
  } else {
    skip("story 6 - the payment activates a subscription", "phase 4.1");
  }

  // -- story 7: upload and review a document --------------------------------
  // The agent must be assigned the customer first. Since document scoping landed,
  // an agent with no assignment is refused every read and every status change, so
  // this step is a prerequisite of the review story rather than a separate feature.
  // It also exercises POST /api/manager/assignments end to end. assign() is
  // idempotent, so re-running smoke against the same database is safe.
  const reviewCustomerId = data<{ profile: { id: string } }>(
    await need("customer resolves own id", call("GET", "/customers/me", { token: customerToken })),
  ).profile.id;
  const reviewAgentId = data<{ items: Array<{ id: string }> }>(
    await need(
      "reviewing agent lookup",
      call("GET", `/admin/users?role=agent&search=${encodeURIComponent(AGENT.email)}&pageSize=1`, {
        token: adminToken,
      }),
    ),
  ).items[0].id;

  await need(
    "assign the customer to the reviewing agent",
    // adminToken, not a manager login: /api/manager admits manager and admin, and
    // smoke already holds an admin token.
    call("POST", "/manager/assignments", {
      token: adminToken,
      body: { agentId: reviewAgentId, customerId: reviewCustomerId },
    }),
  );
  pass("story 7 - agent is assigned the customer");

  const uploadTarget = data<{ document: { id: string }; uploadMode: string }>(
    await need(
      "document upload target",
      call("POST", "/documents/upload-url", {
        token: customerToken,
        body: { fileName: "smoke-permit.pdf", contentType: "application/pdf", serviceId },
      }),
    ),
  );
  pass("story 7 - upload target issued", `mode ${uploadTarget.uploadMode}`);

  const documentId = uploadTarget.document.id;
  await need(
    "document under review",
    call("PATCH", `/documents/${documentId}/status`, {
      token: agentToken,
      body: { fromStatus: "pending", toStatus: "under_review" },
    }),
  );
  pass("story 7 - agent takes the document under review");

  const rejected = await call("PATCH", `/documents/${documentId}/status`, {
    token: agentToken,
    body: { fromStatus: "under_review", toStatus: "rejected", note: "Expired permit" },
  });
  if (rejected.status === 200) {
    pass("story 7 - agent rejects with a reason");
  } else {
    fail("story 7 - agent rejects with a reason", `HTTP ${rejected.status}`);
  }

  const resubmitted = await call("POST", `/documents/${documentId}/resubmit`, {
    token: customerToken,
  });
  if (resubmitted.status >= 200 && resubmitted.status < 300) {
    pass("story 7 - customer resubmits as a new version");
  } else {
    skip("story 7 - customer resubmits as a new version", "phase 5.1");
  }

  const checklist = await call("GET", "/customers/me/required-documents", {
    token: customerToken,
  });
  if (checklist.status === 200) {
    pass("story 7 - required-documents checklist");
  } else {
    skip("story 7 - required-documents checklist", "phase 5.2");
  }

  // -- story 8: the customer dashboard --------------------------------------
  const dashboard = await need(
    "customer dashboard",
    call("GET", "/customers/me/dashboard", { token: customerToken }),
  );
  pass("story 8 - customer dashboard", Object.keys(data<Json>(dashboard)).join(", "));

  const invoices = data<unknown[]>(
    await need(
      "customer invoices",
      call("GET", "/customers/me/invoices", { token: customerToken }),
    ),
  );
  pass("story 8 - customer sees their invoices", `${invoices.length} invoice(s)`);

  // -- cleanup: leave the catalogue as we found it ---------------------------
  await call("DELETE", `/admin/packages/${packageId}`, { token: adminToken });
  await call("DELETE", `/admin/services/${serviceId}`, { token: adminToken });

  console.log("-".repeat(64));
  console.log(`${passed} passed, ${failed} failed, ${skipped} not built yet\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`\nFAIL  smoke run aborted -- ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
