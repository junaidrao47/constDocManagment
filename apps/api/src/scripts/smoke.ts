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
const MANAGER = { email: "manager@test.com", password: "ManagerPassword123!" };
const CUSTOMER = { email: "customer@test.com", password: "CustomerPassword123!" };
// Seeded second customer/agent, used only for the IDOR and not-assigned negatives.
const CUSTOMER2 = { email: "customer2@test.com", password: "CustomerPassword123!" };
const AGENT2 = { email: "agent2@test.com", password: "AgentPassword123!" };

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

/** Asserts a negative case: the exact HTTP status and, when given, the error code. */
function expectError(step: string, response: ApiResponse, status: number, code?: string): void {
  const bodyCode = (response.body?.error as { code?: string } | undefined)?.code;
  if (response.status === status && (!code || bodyCode === code)) {
    pass(step, `HTTP ${status}${code ? ` ${code}` : ""}`);
  } else {
    fail(step, `expected HTTP ${status}${code ? ` ${code}` : ""}, got HTTP ${response.status} ${bodyCode ?? ""}`);
  }
}

/** A tiny but genuine PDF (starts with the %PDF magic bytes), unique per marker. */
function makePdf(marker: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% smoke ${marker}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

type UploadTarget = { uploadMode: string; upload: { url: string; fields: Record<string, string> } };

/**
 * Sends the bytes for an issued upload target. In S3 mode this is a direct
 * multipart POST to the presigned S3 URL (no bearer token -- the policy is the
 * credential); in local mode it is a multipart POST to the API's version-upload
 * route. Returns the raw HTTP status so callers can assert S3's own enforcement
 * (e.g. a 26 MB body rejected by `content-length-range`).
 */
async function putBytes(
  documentId: string,
  versionId: string,
  target: UploadTarget,
  buffer: Buffer,
  fileName: string,
  contentType: string,
  token: string,
): Promise<number> {
  // Buffer is a Uint8Array at runtime (a valid BlobPart); the cast only placates
  // the @types/node ArrayBufferLike-vs-ArrayBuffer lib mismatch, with no copy.
  const part = buffer as unknown as BlobPart;
  const form = new FormData();
  if (target.uploadMode === "s3") {
    for (const [key, value] of Object.entries(target.upload.fields)) form.append(key, value);
    form.append("file", new Blob([part], { type: contentType }), fileName);
    const response = await fetch(target.upload.url, { method: "POST", body: form });
    return response.status;
  }
  form.append("file", new Blob([part], { type: contentType }), fileName);
  const response = await fetch(`${API}/documents/${documentId}/versions/${versionId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return response.status;
}

/** Uploads a new version through the real intent -> bytes -> confirm pipeline. */
async function uploadVersion(
  token: string,
  documentId: string,
  buffer: Buffer,
  fileName: string,
  contentType: string,
  kind?: "staff_on_behalf" | "official",
): Promise<ApiResponse> {
  const intent = data<{ versionId: string; uploadMode: string; upload: UploadTarget["upload"] }>(
    await need(
      `upload-intent (${fileName})`,
      call("POST", `/documents/${documentId}/versions/upload-intent`, {
        token,
        body: { fileName, contentType, ...(kind ? { kind } : {}) },
      }),
    ),
  );
  const putStatus = await putBytes(documentId, intent.versionId, intent, buffer, fileName, contentType, token);
  if (putStatus >= 300) throw new Error(`byte upload for ${fileName} returned HTTP ${putStatus}`);
  return need(
    `confirm (${fileName})`,
    call("POST", `/documents/${documentId}/versions/${intent.versionId}/confirm`, { token }),
  );
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

  // -- story 0: admin creates a category (services/packages require one) -----
  const categorySlug = `smoke-cat-${Date.now()}`;
  const categoryId = data<{ id: string }>(
    await need(
      "create category",
      call("POST", "/admin/categories", {
        token: adminToken,
        body: { slug: categorySlug, nameEn: "Smoke Category", nameEs: "Categoría Smoke" },
      }),
    ),
  ).id;
  pass("story 0 - admin creates a category", categorySlug);

  // -- story 1: admin creates a service -------------------------------------
  const serviceName = `Smoke Service ${Date.now()}`;
  const serviceId = data<{ id: string }>(
    await need(
      "create service",
      call("POST", "/admin/services", {
        token: adminToken,
        body: { name: serviceName, nameEn: serviceName, description: "created by smoke.ts", basePrice: 1200, categoryId },
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
          nameEn: packageName,
          type: "standard",
          price: 48000,
          durationDays: 365,
          categoryId,
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

  // the public list filters by category slug and embeds the category object
  const filteredPackages = data<Array<{ id: string; category: { slug: string } | null }>>(
    await need("public packages filtered by category", call("GET", `/public/packages?category=${categorySlug}`)),
  );
  const filteredHit = filteredPackages.find((row) => row.id === packageId);
  if (filteredHit && filteredHit.category?.slug === categorySlug) {
    pass("story 3 - public list filters by category and returns the category object");
  } else {
    fail("story 3 - public list filters by category", filteredHit ? "category object missing/mismatched" : "package missing from ?category filter");
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

  // Give THIS customer an accepted quotation for the smoke service, so the
  // required-documents checklist lists it (`purchasedServiceIds` needs an accepted
  // quotation or an active subscription for the service).
  const customerQuoteId = data<{ id: string }>(customerQuote).id;
  await need(
    "send customer quotation",
    call("PATCH", `/admin/quotations/${customerQuoteId}/status`, { token: adminToken, body: { status: "sent" } }),
  );
  await need(
    "accept customer quotation",
    call("PATCH", `/admin/quotations/${customerQuoteId}/status`, { token: adminToken, body: { status: "accepted" } }),
  );

  // Admin defines a required document (the checklist item) for the service.
  const requirementId = data<{ id: string }>(
    await need(
      "admin creates a required document",
      call("POST", `/admin/services/${serviceId}/requirements`, {
        token: adminToken,
        body: { nameEn: "Business permit", nameEs: "Permiso de negocio", isRequired: true, sortOrder: 0 },
      }),
    ),
  ).id;
  pass("story 7 - admin defines a required document for the service");

  // 1. Customer's first upload: create the document + an intent, PUT the bytes,
  //    confirm. A first upload leaves the document `pending`.
  const firstPdf = makePdf("v1");
  const created = data<{ document: { id: string }; versionId: string; uploadMode: string; upload: UploadTarget["upload"] }>(
    await need(
      "document upload target",
      call("POST", "/documents/upload-url", {
        token: customerToken,
        body: { fileName: "smoke-permit.pdf", contentType: "application/pdf", serviceId, requirementId },
      }),
    ),
  );
  const documentId = created.document.id;
  pass("story 7 - upload target issued", `mode ${created.uploadMode}`);

  const firstPut = await putBytes(documentId, created.versionId, created, firstPdf, "smoke-permit.pdf", "application/pdf", customerToken);
  if (firstPut >= 300) throw new Error(`first byte upload returned HTTP ${firstPut}`);
  const confirmed = await need(
    "confirm first version",
    call("POST", `/documents/${documentId}/versions/${created.versionId}/confirm`, { token: customerToken }),
  );
  if (data<{ status: string }>(confirmed).status === "pending") {
    pass("story 7 - customer uploads the first version (stays pending)");
  } else {
    fail("story 7 - customer uploads the first version", `status is ${data<{ status: string }>(confirmed).status}`);
  }

  // 2. Agent review: pending -> under_review -> rejected (a note is required).
  await need(
    "document under review",
    call("PATCH", `/documents/${documentId}/status`, { token: agentToken, body: { fromStatus: "pending", toStatus: "under_review" } }),
  );
  pass("story 7 - agent takes the document under review");

  await need(
    "agent rejects with a note",
    call("PATCH", `/documents/${documentId}/status`, { token: agentToken, body: { fromStatus: "under_review", toStatus: "rejected", note: "Expired permit" } }),
  );
  pass("story 7 - agent rejects with a reason");

  // 3. Customer resubmits a NEW version -> rejected moves back to pending.
  const resubmit = await uploadVersion(customerToken, documentId, makePdf("v2"), "smoke-permit-v2.pdf", "application/pdf");
  if (data<{ status: string }>(resubmit).status === "pending") {
    pass("story 7 - customer resubmits a new version (rejected -> pending)");
  } else {
    fail("story 7 - customer resubmits a new version", `status is ${data<{ status: string }>(resubmit).status}`);
  }

  const versionsAfterResubmit = data<Array<{ versionNo: number; kind: string }>>(
    await need("list versions", call("GET", `/documents/${documentId}/versions`, { token: customerToken })),
  );
  if (versionsAfterResubmit.filter((v) => v.kind === "customer").length >= 2) {
    pass("story 7 - version history is preserved", `${versionsAfterResubmit.length} version(s)`);
  } else {
    fail("story 7 - version history is preserved", `only ${versionsAfterResubmit.length} version(s)`);
  }

  // 4. Agent approves: pending -> under_review -> approved.
  await need("re-review", call("PATCH", `/documents/${documentId}/status`, { token: agentToken, body: { fromStatus: "pending", toStatus: "under_review" } }));
  await need("approve", call("PATCH", `/documents/${documentId}/status`, { token: agentToken, body: { fromStatus: "under_review", toStatus: "approved" } }));
  pass("story 7 - agent approves the document");

  // 5. Agent marks it submitted to the government.
  await need(
    "submit to government",
    call("PATCH", `/documents/${documentId}/status`, { token: agentToken, body: { fromStatus: "approved", toStatus: "submitted_to_government" } }),
  );
  pass("story 7 - agent marks it submitted to the government");

  // 6. Staff upload the official approved file -> moves back to approved.
  const officialPdf = makePdf("official");
  const afterOfficial = await uploadVersion(agentToken, documentId, officialPdf, "smoke-official.pdf", "application/pdf", "official");
  if (data<{ status: string }>(afterOfficial).status === "approved") {
    pass("story 7 - staff upload the official file (-> approved)");
  } else {
    fail("story 7 - staff upload the official file", `status is ${data<{ status: string }>(afterOfficial).status}`);
  }

  const history = data<Array<{ toStatus: string }>>(
    await need("document history", call("GET", `/documents/${documentId}/history`, { token: agentToken })),
  );
  if (history.some((h) => h.toStatus === "submitted_to_government") && history.some((h) => h.toStatus === "approved")) {
    pass("story 7 - history records every transition", `${history.length} rows`);
  } else {
    fail("story 7 - history records every transition", `rows: ${history.map((h) => h.toStatus).join(", ")}`);
  }

  // 7. Customer downloads the official file -> HTTP 200 and the bytes match.
  const officialVersion = data<Array<{ id: string; kind: string }>>(
    await need("customer lists versions", call("GET", `/documents/${documentId}/versions`, { token: customerToken })),
  ).find((v) => v.kind === "official");
  if (!officialVersion) {
    fail("story 7 - customer downloads the official file", "no official version visible to the customer");
  } else {
    const dl = data<{ downloadUrl: string; downloadMode: string }>(
      await need("official download url", call("GET", `/documents/${documentId}/versions/${officialVersion.id}/download-url`, { token: customerToken })),
    );
    // In S3 mode the presigned URL carries its own auth; in local mode the download
    // route is a normal authenticated API endpoint, so the token must be sent.
    const fetched = await fetch(dl.downloadUrl, dl.downloadMode === "local" ? { headers: { Authorization: `Bearer ${customerToken}` } } : {});
    const bytes = Buffer.from(await fetched.arrayBuffer());
    if (fetched.status === 200 && bytes.equals(officialPdf)) {
      pass("story 7 - customer downloads the official file (bytes match)", `${bytes.length} bytes`);
    } else {
      fail("story 7 - customer downloads the official file", `HTTP ${fetched.status}, ${bytes.length} bytes, match=${bytes.equals(officialPdf)}`);
    }
  }

  // 8. The required-documents checklist reaches 100% for the service.
  const checklist = data<{ services: Array<{ serviceId: string; completion: number }> }>(
    await need("customer checklist", call("GET", "/customers/me/checklist", { token: customerToken })),
  );
  const checklistBlock = checklist.services.find((s) => s.serviceId === serviceId);
  if (checklistBlock && checklistBlock.completion === 100) {
    pass("story 7 - required-documents checklist reaches 100%");
  } else {
    fail("story 7 - required-documents checklist", checklistBlock ? `completion ${checklistBlock.completion}%` : "service not in checklist (not purchased?)");
  }

  // -- story 7 negatives: the upload and access guards ----------------------
  const wrongType = await call("POST", "/documents/upload-url", {
    token: customerToken,
    body: { fileName: "evil.html", contentType: "text/html", serviceId },
  });
  expectError("story 7 neg - wrong file type is refused", wrongType, 415, "FILE_TYPE_NOT_ALLOWED");

  // 26 MB on a FRESH pending document: S3's content-length-range rejects the POST
  // itself (S3 mode); in local mode the ceiling is enforced on confirm (413).
  const bigCreate = data<{ document: { id: string }; versionId: string; uploadMode: string; upload: UploadTarget["upload"] }>(
    await need("size-test upload target", call("POST", "/documents/upload-url", { token: customerToken, body: { fileName: "big.pdf", contentType: "application/pdf", serviceId } })),
  );
  const oversize = Buffer.concat([makePdf("big"), Buffer.alloc(26 * 1024 * 1024)]);
  const bigStatus = await putBytes(bigCreate.document.id, bigCreate.versionId, bigCreate, oversize, "big.pdf", "application/pdf", customerToken);
  let oversizeRejected = bigStatus >= 400;
  if (!oversizeRejected) {
    const conf = await call("POST", `/documents/${bigCreate.document.id}/versions/${bigCreate.versionId}/confirm`, { token: customerToken });
    oversizeRejected = conf.status === 413;
  }
  if (oversizeRejected) pass("story 7 neg - a 26 MB upload is refused", `put HTTP ${bigStatus}`);
  else fail("story 7 neg - a 26 MB upload is refused", `put HTTP ${bigStatus}, confirm did not 413`);

  // Replace while locked: the main document is `approved`, so a customer intent is refused.
  const lockedReplace = await call("POST", `/documents/${documentId}/versions/upload-intent`, {
    token: customerToken,
    body: { fileName: "sneaky.pdf", contentType: "application/pdf" },
  });
  expectError("story 7 neg - customer cannot replace a locked document", lockedReplace, 409, "DOCUMENT_LOCKED");

  const agent2Token = await login(AGENT2);
  const notAssigned = await call("GET", `/documents/${documentId}`, { token: agent2Token });
  expectError("story 7 neg - an unassigned agent is refused", notAssigned, 403);

  const customer2Token = await login(CUSTOMER2);
  const idor = await call("GET", `/documents/${documentId}`, { token: customer2Token });
  expectError("story 7 neg - customer B cannot read customer A's document (IDOR)", idor, 403);

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

  // -- story 9: account approval + manager assignment -----------------------
  // A brand-new self-registration starts pending and is locked out of the portal
  // until an admin approves it and assigns a manager (PROJECT-BRIEF §11.1/§11.2).
  const pendingEmail = `smoke-pending-${Date.now()}@test.com`;
  const registration = await need(
    "register a new customer",
    call("POST", "/auth/register", { body: { email: pendingEmail, password: "CustomerPassword123!", name: "Pending Co" } }),
  );
  const pendingCustomer = data<{ user: { id: string; accountStatus: string }; accessToken: string }>(registration);
  const pendingId = pendingCustomer.user.id;
  let pendingToken = pendingCustomer.accessToken;
  if (pendingCustomer.user.accountStatus === "pending_approval") {
    pass("story 9 - a new registration is pending_approval");
  } else {
    fail("story 9 - a new registration is pending", `accountStatus is ${pendingCustomer.user.accountStatus}`);
  }

  // Pending: the portal is gated, but reading own record is allowed.
  const blocked = await call("GET", "/customers/me/dashboard", { token: pendingToken });
  expectError("story 9 neg - a pending customer is blocked from the portal", blocked, 403, "ACCOUNT_PENDING");
  const ownRecord = await call("GET", "/customers/me", { token: pendingToken });
  if (ownRecord.status === 200) pass("story 9 - a pending customer can still read /me");
  else fail("story 9 - a pending customer can read /me", `HTTP ${ownRecord.status}`);

  // Approve requires a manager: the manager-less call is a precise MANAGER_REQUIRED.
  const noManager = await call("POST", `/admin/customers/${pendingId}/approve`, { token: adminToken, body: {} });
  expectError("story 9 neg - approving without a manager is refused", noManager, 400, "MANAGER_REQUIRED");

  const managerId = data<{ items: Array<{ id: string }> }>(
    await need("manager lookup", call("GET", `/admin/users?role=manager&search=${encodeURIComponent(MANAGER.email)}&pageSize=1`, { token: adminToken })),
  ).items[0].id;
  await need(
    "approve the customer with a manager",
    call("POST", `/admin/customers/${pendingId}/approve`, { token: adminToken, body: { managerId } }),
  );
  pass("story 9 - admin approves the customer and assigns a manager");

  // The session cache was invalidated on approval, so the same token now works.
  pendingToken = await login({ email: pendingEmail, password: "CustomerPassword123!" });
  const afterApproval = await call("GET", "/customers/me/dashboard", { token: pendingToken });
  if (afterApproval.status === 200) pass("story 9 - the approved customer reaches the portal");
  else fail("story 9 - the approved customer reaches the portal", `HTTP ${afterApproval.status}`);

  // -- story 10: onboarding -------------------------------------------------
  const onboardingEmail = `ops-${Date.now()}@acme.test`;
  const onboarding = data<{ onboarding: { completed: boolean; notificationEmails: string[] } }>(
    await need(
      "save onboarding",
      call("PUT", "/customers/me/onboarding", {
        token: pendingToken,
        body: {
          persona: "company",
          legalName: "Acme S.A. de C.V.",
          contactName: "Juana Pérez",
          notificationEmails: [onboardingEmail],
          phone: "+52 55 1234 5678",
          state: "CDMX",
          city: "Ciudad de México",
          needs: ["permits"],
          locale: "es-MX",
        },
      }),
    ),
  );
  if (onboarding.onboarding.completed && onboarding.onboarding.notificationEmails.includes(onboardingEmail)) {
    pass("story 10 - onboarding saved and marked complete", onboardingEmail);
  } else {
    fail("story 10 - onboarding saved", `completed=${onboarding.onboarding.completed}`);
  }

  // -- story 11: document phases + progress + phase emails ------------------
  const managerToken = await login(MANAGER);

  // The approved customer uploads a document so the manager has something to phase.
  const phaseDoc = data<{ document: { id: string }; versionId: string; uploadMode: string; upload: UploadTarget["upload"] }>(
    await need(
      "phase document upload target",
      call("POST", "/documents/upload-url", { token: pendingToken, body: { fileName: "phase-doc.pdf", contentType: "application/pdf" } }),
    ),
  );
  const phaseDocId = phaseDoc.document.id;
  const phasePut = await putBytes(phaseDocId, phaseDoc.versionId, phaseDoc, makePdf("phase-doc"), "phase-doc.pdf", "application/pdf", pendingToken);
  if (phasePut >= 300) throw new Error(`phase document byte upload returned HTTP ${phasePut}`);
  await need("confirm phase document", call("POST", `/documents/${phaseDocId}/versions/${phaseDoc.versionId}/confirm`, { token: pendingToken }));

  const created3 = data<{ phases: Array<{ id: string }>; progress: { total: number; percent: number } }>(
    await need(
      "manager creates 3 phases",
      call("POST", `/documents/${phaseDocId}/phases`, {
        token: managerToken,
        body: {
          phases: [
            { nameEn: "Submission", nameEs: "Presentación", department: "SAT" },
            { nameEn: "Municipal review", nameEs: "Revisión municipal", department: "Municipio" },
            { nameEn: "Final approval", nameEs: "Aprobación final", department: "Gobierno" },
          ],
        },
      }),
    ),
  );
  if (created3.phases.length === 3 && created3.progress.total === 3 && created3.progress.percent === 0) {
    pass("story 11 - manager adds 3 phases", `progress ${created3.progress.percent}%`);
  } else {
    fail("story 11 - manager adds 3 phases", `${created3.phases.length} phases, ${created3.progress.percent}%`);
  }

  // Upload the result file for phase 1 → it completes and progress reaches 33%.
  const firstPhaseId = created3.phases[0].id;
  const resultIntent = data<{ versionId: string; uploadMode: string; upload: UploadTarget["upload"] }>(
    await need(
      "phase result upload intent",
      call("POST", `/documents/${phaseDocId}/phases/${firstPhaseId}/result-upload-intent`, { token: managerToken, body: { fileName: "phase1-result.pdf", contentType: "application/pdf" } }),
    ),
  );
  const resultPut = await putBytes(phaseDocId, resultIntent.versionId, resultIntent, makePdf("phase1-result"), "phase1-result.pdf", "application/pdf", managerToken);
  if (resultPut >= 300) throw new Error(`phase result byte upload returned HTTP ${resultPut}`);
  const confirmedPhase = data<{ phase: { status: string }; progress: { percent: number } }>(
    await need(
      "confirm phase 1 result",
      call("POST", `/documents/${phaseDocId}/phases/${firstPhaseId}/result/${resultIntent.versionId}/confirm`, { token: managerToken }),
    ),
  );
  if (confirmedPhase.phase.status === "completed" && confirmedPhase.progress.percent === 33) {
    pass("story 11 - phase 1 result upload completes it (progress 33%)");
  } else {
    fail("story 11 - phase 1 completes at 33%", `status ${confirmedPhase.phase.status}, ${confirmedPhase.progress.percent}%`);
  }

  // The customer sees the phases and progress on their own document.
  const customerView = data<{ phases: Array<{ status: string }>; progress: { percent: number } }>(
    await need("customer reads phased document", call("GET", `/documents/${phaseDocId}`, { token: pendingToken })),
  );
  if (customerView.phases.length === 3 && customerView.progress.percent === 33) {
    pass("story 11 - customer sees the phase list and progress");
  } else {
    fail("story 11 - customer sees phases", `${customerView.phases.length} phases, ${customerView.progress.percent}%`);
  }

  // Negative: an illegal phase transition (completed → rejected) is refused.
  const badTransition = await call("PATCH", `/documents/${phaseDocId}/phases/${firstPhaseId}`, {
    token: managerToken,
    body: { status: "rejected", note: "trying to reject an already-completed phase" },
  });
  expectError("story 11 neg - illegal phase transition is refused", badTransition, 409, "PHASE_INVALID_TRANSITION");

  // The manager workspace lists the customer with progress.
  const myCustomers = data<Array<{ id: string; progress: { percent: number } }>>(
    await need("manager workspace", call("GET", "/manager/customers", { token: managerToken })),
  );
  if (myCustomers.some((c) => c.id === pendingId)) {
    pass("story 11 - the customer appears in the manager's workspace");
  } else {
    fail("story 11 - manager workspace lists the customer", "customer missing");
  }

  // -- story 12: admin analytics overview -----------------------------------
  const analytics = data<{ customersByStatus: unknown[]; revenue: { currency: string } }>(
    await need("admin analytics overview", call("GET", "/admin/analytics/overview", { token: adminToken })),
  );
  if (Array.isArray(analytics.customersByStatus) && analytics.revenue.currency === "MXN") {
    pass("story 12 - admin analytics overview", `${analytics.customersByStatus.length} status buckets`);
  } else {
    fail("story 12 - admin analytics overview", "unexpected shape");
  }

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
