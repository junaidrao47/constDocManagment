# API Surface — by Portal

Endpoint specification for the Construction & Compliance Service Management Platform.
Companion document: `docs/delivery-plan.md` for phasing and role definitions.

Status markers used throughout:

- **DONE** — implemented and working against the database today
- **STUB** — the route exists and answers, but returns a hardcoded `[]`, `{}` or `total: 0`
- **NEW** — does not exist yet
- **FIX** — exists but is wrong; see the note

All request bodies are validated with zod per AGENT.md rule 6. All list endpoints take
`?page`, `?limit`, `?sort`, and their own filters; pagination is omitted from the tables
below to keep them readable.

### Response envelopes

Success (2xx) — unchanged:

```json
{ "success": true, "data": <T>, "message": "ok" }
```

Failure (every non-2xx) — one shape, emitted by the central error handler:

```json
{ "success": false, "error": { "code": "DOCUMENT_LOCKED", "message": "<English, for devs/logs>", "details": { "field": ["..."] }, "requestId": "<uuid>" } }
```

- `code` is a stable string the frontend branches on and localises; the full list is in `docs/error-codes.md`.
- `message` is English, written for a developer and safe to surface; it never contains a stack, SQL, or an internal name.
- `details` is present only for validation failures and carries Zod's per-field errors.
- `requestId` ties the response to the server log. Every request accepts an inbound **`x-request-id`** header (a token matching `^[A-Za-z0-9._-]{1,128}$`, otherwise a fresh UUID is generated) and returns it in the **`x-request-id`** response header.

---

## Route namespaces

| Prefix | Auth | Purpose |
|---|---|---|
| `/api/auth` | none | Credential exchange |
| `/api/public` | none | Public website and the pricing calculator |
| `/api/customers` | `customer` | Customer portal |
| `/api/documents` | mixed | Shared document operations, role-scoped per route |
| `/api/agent` | `agent`, `manager` | Agent and manager portal |
| `/api/admin` | `admin` | Admin dashboard |
| `/api/manager` | `manager` | Manager-only oversight, split out of `/api/admin` |
| `/api/webhooks` | signature | Payment provider callbacks |
| `/health`, `/health/ready` | none | Liveness and readiness |

The unauthenticated `/api/quotations`, `/api/pricing` and `/api/packages` mounts that exist
today should move under `/api/public`, so the authentication boundary is visible in the URL
and nginx can rate-limit the public surface separately. They are all stubs, so this costs
nothing now and gets more expensive every week it waits.

---

## Public implementation note

The first public backend slice is available under `/api/public`:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/api/public/services` | DONE | Active service catalogue |
| GET | `/api/public/packages` | DONE | Active packages with bundled services |
| GET | `/api/public/worker-ranges` | DONE | Active worker pricing bands |
| GET | `/api/public/locations` | DONE | Active locations and pricing modifiers |
| GET | `/api/public/industries` | DONE | Industry selector data |
| POST | `/api/public/quotations/calculate` | DONE | Calculate a quote from database pricing data |
| GET | `/api/customers/me/dashboard` | DONE | Customer dashboard summary |
| GET | `/api/agent/documents` | DONE | Agent/manager document review collection |

Customer upload remains available through the existing authenticated document flow:
`POST /api/documents/upload-url`, followed by the returned S3 `PUT` or local multipart `POST` URL.

## 1. Authentication — `/api/auth`

No portal owns these; all four roles use them.

| Method | Path | Status | Purpose |
|---|---|---|---|
| POST | `/register` | DONE | Create a customer account. Role is pinned to `customer` — correct, keep it |
| POST | `/login` | DONE | Issue access + refresh pair |
| POST | `/refresh` | DONE | Rotate the pair; revokes the presented token first |
| POST | `/logout` | DONE | Revoke the refresh token, taken from the body only — the header fallback passed an *access* token to the refresh verifier and always threw |
| POST | `/forgot-password` | DONE | Emails an opaque, single-use token and answers identically for known, unknown and disabled addresses |
| POST | `/reset-password` | DONE | Consumes the token atomically and ends every existing session, access tokens included |
| POST | `/change-password` | NEW | Authenticated change with current-password confirmation; revokes other sessions |
| GET | `/session` | NEW | Only needed if decision A lands on HTTP-only cookies, since the browser cannot read the token itself |

Phase 1. If cookies are adopted per scope §11, `/login`, `/refresh` and `/logout` set and
clear `httpOnly; Secure; SameSite=Strict` cookies instead of returning tokens, and a CSRF
defence is added — `cors({ credentials: true })` is already set for a cookie flow that does
not exist yet.

---

## 2. Public website — `/api/public`

Unauthenticated. Serves scope §3 and the §4 calculator. This is the lead-generation surface,
so it should be cached and rate-limited more tightly than the authenticated routes.

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/categories` | DONE | Active categories, ordered by `sortOrder`, each with `serviceCount`/`packageCount` |
| GET | `/services` | DONE | Active services with prices. Accepts `?category=<slug>`; each item carries a `category` object |
| GET | `/packages` | DONE | Active packages with bundled services. Accepts `?category=<slug>`; each item carries a `category` object |
| GET | `/packages/:id` | NEW | Single package detail |
| GET | `/industries` | NEW | Industry list for the calculator's first input |
| GET | `/locations/states` | NEW | Distinct states |
| GET | `/locations/cities?state=` | NEW | Cities within a state |
| GET | `/worker-ranges` | STUB | Worker bands, to show pricing tiers |
| POST | `/quotations/calculate` | STUB | **The calculator.** `pricing.engine.ts` already implements this correctly and no route calls it — wiring it up is a few lines. Returns a breakdown, persists nothing |
| POST | `/quotations/request` | NEW | Convert a calculation into a saved `Draft` quotation and capture the lead |
| GET | `/faqs` | NEW | FAQ list, grouped by category |
| GET | `/reviews` | NEW | Approved customer reviews only |
| POST | `/contact` | NEW | Contact form. Rate-limited per IP, needs a spam guard, notifies admin |
| GET | `/settings` | NEW | Public business info — name, address, hours, social links — so content is editable without a deploy |

Phases 3 and 6. Note that `industryId` is accepted by the pricing engine and never used in
the formula, so the industry selector has no effect on price until Phase 3 adds a weight.

**Localization.** The category, service and package lists resolve `name`/`description` to one
language by the `Accept-Language` header — Spanish (`es-MX`) is the default, English the
fallback (a header whose first tag starts with `en` selects English). The `category` object
embedded on each service/package item is `{ id, slug, name, description, icon, imageUrl }`,
already resolved to the chosen language. A `?category=<slug>` that matches no active category
returns an empty list.

---

## 3. Customer portal — `/api/customers` and `/api/documents`

`authenticate` + `authorize("customer")`. Every query filters on `customer_id = req.user.id`
in the service layer. No endpoint here may accept a customer id from the client.

Profile and dashboard:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/me` | DONE | Profile with record counts |
| PATCH | `/api/users/me` | DONE | Update name, phone, email with a uniqueness check |
| GET | `/me/dashboard` | NEW | Scope §5 dashboard: active services, documents needing attention, next renewal, unpaid invoices, recent activity |

Documents (scope §5, §6). The upload pipeline is version-based: a document owns many
`document_versions` (`customer` / `staff_on_behalf` / `official`), and `upload-url` /
`upload-intent` issue a two-step intent that `confirm` finalises (HEAD + size + allow-list
+ magic bytes, then the role transition, history and email in one transaction). Statuses
and allowed transitions are served by the API, never hardcoded by a frontend.

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/api/documents/statuses` | DONE | The status contract: every status + display key, and allowed transitions by role. Any authenticated role |
| GET | `/me/documents` | DONE | Own documents with signed download URLs |
| GET | `/me/checklist` | DONE | Purchased services with their required-documents, submitted state, status and completion % (`?locale=en\|es`) |
| GET | `/api/documents/:id` | DONE | Single document (owner or staff) |
| GET | `/api/documents/:id/history` | DONE | Full status + version audit trail |
| POST | `/api/documents/upload-url` | DONE | Create a `pending` document + first version intent; returns a presigned S3 POST (`content-length-range` 1–25 MB, exact `Content-Type`) or a local URL |
| POST | `/api/documents/:id/versions/upload-intent` | DONE | Intent for a NEW version (customer resubmission, or staff `staff_on_behalf`/`official`) |
| POST | `/api/documents/:id/versions/:versionId/confirm` | DONE | Validate the bytes, mark the version ready, apply the transition |
| POST | `/api/documents/:id/versions/:versionId/upload` | DONE | Local-mode byte sink for an intent |
| GET | `/api/documents/:id/versions` | DONE | Ready versions (customers never see `staff_on_behalf`) |
| GET | `/api/documents/:id/versions/:versionId/download-url` | DONE | Signed download (`attachment`); customers get the latest official file only once `approved` |
| GET | `/api/documents/:id/versions/:versionId/preview-url` | DONE | Short-expiry inline URL for PDF/image preview |
| POST | `/api/documents/:id/upload` | DONE | Single-call convenience upload (API holds the bytes, then runs confirm) |
| POST | `/api/documents/:id/approved-upload` | DONE | Staff upload the official file; moves `submitted_to_government → approved` |
| GET | `/api/documents/:id/download-url` · `/download` | DONE | Legacy single-file download (customer-portal UI) |

Quotations (scope §6a lifecycle Draft → Sent → Under Review → Accepted → Expired):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/me/quotations` | NEW | Own quotations, filterable by status |
| GET | `/me/quotations/:id` | NEW | Full breakdown with line items |
| POST | `/me/quotations` | NEW | Request a quotation from a saved calculation |
| POST | `/me/quotations/:id/accept` | NEW | Accept while not expired; triggers subscription and invoice creation |
| GET | `/me/quotations/:id/pdf` | NEW | Downloadable quotation |

Subscriptions, invoices and payments (scope §5, §9):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/me/subscriptions` | DONE | Currently filters `status: "active"` against an unconstrained varchar |
| GET | `/me/subscriptions/:id` | NEW | Detail with package, services and renewal date |
| POST | `/me/subscriptions/:id/renew` | NEW | Start a renewal, producing an invoice |
| POST | `/me/subscriptions/:id/cancel` | NEW | Request cancellation |
| GET | `/me/invoices` | DONE | Invoice list |
| GET | `/me/invoices/:id` | NEW | Detail with line items and payment state |
| GET | `/me/invoices/:id/pdf` | NEW | Downloadable invoice |
| POST | `/me/invoices/:id/pay` | NEW | Create a gateway payment intent, return the redirect or client secret |
| GET | `/me/payments` | NEW | Payment history (scope §5) |

Notifications (scope §6a, §10):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/me/notifications` | NEW | In-app feed from `notifications_log` |
| GET | `/me/notifications/unread-count` | NEW | Badge count |
| PATCH | `/me/notifications/:id/read` | NEW | Mark one read |
| POST | `/me/notifications/read-all` | NEW | Mark all read |
| GET/PATCH | `/me/notification-preferences` | NEW | Per-category email opt-out |

---

## 4. Agent and manager portal — `/api/agent`

`authenticate` + `authorize("agent", "manager")`. Every list is scoped to customers assigned
to the caller; a manager sees their whole team's assignments instead of a personal queue.

The assignment table does not exist yet — there is no `assign` anywhere in the codebase — so
the customer-scoped half of this portal is still blocked on Phase 4. The document routes are
not: Phase 1 opened reads and status changes to staff, so an agent or manager can fetch,
download and approve a document today. Until assignments exist that visibility is *every*
customer's documents rather than an assigned subset, which is deliberate and marked
`TODO(phase-4)` at the one service helper that decides it.

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/dashboard` | NEW | Review queue depth, documents awaiting action, expiring soon, recent activity |
| GET | `/customers` | NEW | Assigned customers only |
| GET | `/customers/:id` | NEW | Customer detail; 403 if not assigned, not an empty result |
| GET | `/customers/:id/documents` | NEW | That customer's documents |
| GET | `/customers/:id/activity` | NEW | Combined status trail across modules |
| GET | `/documents` | NEW | Review queue, filterable by status and category |
| GET | `/documents/:id` | DONE | Detail. Reads are open to staff; ownership is decided in one service helper. Agent scoping to assigned customers is Phase 4 |
| GET | `/documents/:id/download-url` | DONE | Reviewers can open the file — and `/download` streams it while AWS is unconfigured |
| PATCH | `/documents/:id/status` | DONE | Approve, reject or move to under-review. `manager` is now included, with an optional `fromStatus` concurrency guard |
| GET | `/documents/:id/history` | NEW | Full audit trail |
| GET | `/quotations` | NEW | Quotations for assigned customers |
| PATCH | `/quotations/:id/status` | NEW | Move through the §6a lifecycle. Manager only |
| GET | `/subscriptions` | NEW | Read-only service-progress tracking |
| GET | `/invoices` | NEW | Read-only. Agents get no billing mutations |

Manager oversight — `/api/manager`, split out of `/api/admin` so managers stop inheriting
the full admin surface. Mounted for `manager` **and** `admin`: the matrix below gives both roles
"Assign customer to agent", and an admin locked out could only repair a bad assignment with a
database client.

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/team` | NEW | Agents with their queue depth and throughput |
| GET | `/assignments` | DONE | Current agent-to-customer map. Paginated `{data, pagination}` from the start, filterable by `agentId` or `customerId` |
| POST | `/assignments` | DONE | Assign a customer to an agent. Idempotent on the pair; 404 on an unknown id, 400 when either end has the wrong role; `assignedBy` is taken from the token, never the body |
| DELETE | `/assignments/:id` | DONE | Unassign by the assignment's own id. 404 on an unknown id |
| POST | `/assignments/bulk` | NEW | Reassign a departing agent's book in one call |
| GET | `/reports/workload` | NEW | Distribution across the team |

---

## 5. Admin dashboard — `/api/admin`

`authenticate` + `authorize("admin")`. Covers every module named in scope §7. All eight routes
that exist today are hardcoded placeholders with no service layer and no database access.

Users and access:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/users` | DONE | All users, filterable by role and active state |
| POST | `/users` | DONE | **Create agent, manager and admin accounts.** The only route to a non-customer account: `/api/auth/register` pins the role to `customer` |
| GET | `/users/:id` | DONE | Detail. Related records arrive with the modules that own them |
| PATCH | `/users/:id` | DONE | Update email, role and active state; a role change invalidates live sessions |
| PATCH | `/users/:id/status` | DONE | Activate or deactivate; invalidates live sessions, and refuses an admin disabling themselves |
| POST | `/users/:id/force-reset` | NEW | Admin-initiated password reset |
| DELETE | `/users/:id` | NEW | Soft delete — hard delete cascades across seven tables |

Service catalogue (scope §7):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET, POST | `/categories` | DONE | List all (any status), create. Create/update require a unique kebab-case `slug` + `nameEn`/`nameEs` |
| POST | `/categories/reorder` | DONE | Body `{ orderedIds: string[] }` — sets `sortOrder` by position |
| GET, PATCH, DELETE | `/categories/:id` | DONE | Detail, update, delete. Delete 409s `CATEGORY_NOT_EMPTY` if any service/package references it |
| PATCH | `/categories/:id/status` | DONE | Activate/deactivate (`{ isActive }`), kept separate from edit |
| GET, POST | `/services` | DONE | List and create. **Create now requires `categoryId`** (+ `nameEn`); the category must exist and be active |
| GET, PATCH, DELETE | `/services/:id` | DONE | Detail, update, deactivate. Update accepts an optional `categoryId` (validated active) |
| GET, POST | `/packages` | DONE | List and create. **Create now requires `categoryId`** (+ `nameEn`) |
| GET, PATCH, DELETE | `/packages/:id` | DONE | Detail, update, deactivate. Update requires `categoryId` (full-body schema) |
| PUT | `/packages/:id/services` | NEW | Replace the bundled service set (`package_services`) |
| GET, POST | `/industries` | DONE | List and create |
| GET, PATCH, DELETE | `/industries/:id` | DONE | Includes the pricing weight added in Phase 3 |

Pricing configuration (scope §4 — "no pricing logic will be hardcoded"):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET, POST | `/worker-ranges` | DONE | List and create active worker bands |
| PATCH, DELETE | `/worker-ranges/:id` | DONE | Edit or deactivate a band |
| GET, POST | `/locations` | DONE | State, city, multiplier, city fee |
| PATCH, DELETE | `/locations/:id` | DONE | Edit or deactivate |
| POST | `/locations/import` | NEW | CSV import — states and cities entered by hand will not scale |
| GET, PUT | `/settings` | DONE | Whitelisted app settings: currency, quote_validity_days |
| POST | `/pricing/preview` | NEW | Dry-run the engine against draft rules before publishing them |

Quotations, documents and categories:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/quotations` | NEW | All quotations, filterable by status, customer and date |
| GET | `/quotations/:id` | NEW | Detail with line items |
| PATCH | `/quotations/:id/status` | NEW | Override the lifecycle status |
| GET | `/quotations/:id/history` | NEW | Audit trail |
| GET | `/documents` | DONE | All documents, filterable by status and customer, paginated |
| PATCH | `/documents/:id/status` | DONE | Admin override transition (bypasses the role overlay; note ≥ 5 chars required) |
| GET | `/documents/expiring` | NEW | Expiry pipeline view |
| GET, POST | `/document-categories` | NEW | Scope §6 categorisation. No category column exists yet |
| GET, PATCH, DELETE | `/document-categories/:id` | NEW | Manage the taxonomy |

Required-documents checklist (scope §7.5 — admin manages the per-service checklist items):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/services/:serviceId/requirements` | DONE | List the required documents defined for a service |
| POST | `/services/:serviceId/requirements` | DONE | Add a required document (bilingual name/description, `isRequired`, `sortOrder`, optional `allowedMimeTypes`) |
| GET | `/requirements/:id` | DONE | One requirement |
| PATCH | `/requirements/:id` | DONE | Edit a requirement |
| DELETE | `/requirements/:id` | DONE | Remove a requirement |

Subscriptions, invoices and payments (scope §9):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/subscriptions` | STUB | All subscriptions with renewal dates |
| POST | `/subscriptions` | NEW | Create manually, outside the quotation flow |
| GET, PATCH | `/subscriptions/:id` | NEW | Detail and update |
| PATCH | `/subscriptions/:id/status` | NEW | Move through the §6a lifecycle |
| GET | `/invoices` | NEW | All invoices, filterable by status and overdue |
| POST | `/invoices` | NEW | Raise an invoice, optionally against a subscription |
| GET, PATCH | `/invoices/:id` | NEW | Detail and update |
| PATCH | `/invoices/:id/status` | NEW | Pending, Paid, Overdue, Cancelled |
| POST | `/invoices/:id/send` | NEW | Email it to the customer |
| GET | `/payments` | NEW | All payments with gateway references |
| GET | `/payments/:id` | NEW | Detail |
| POST | `/payments` | NEW | Record an offline or bank-transfer payment |
| PATCH | `/payments/:id/status` | NEW | Pending, Confirmed, Failed |
| POST | `/payments/:id/refund` | NEW | Refund through the gateway |

Notifications, content and analytics:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/notifications` | NEW | Delivery log from `notifications_log`, which has no writer today |
| POST | `/notifications/:id/resend` | NEW | Retry a failed send |
| POST | `/notifications/broadcast` | NEW | Announcement to a filtered customer segment |
| GET, POST | `/notification-templates` | NEW | Edit email copy without a deploy |
| GET, PATCH | `/notification-templates/:id` | NEW | Manage one template |
| GET, POST | `/faqs` | NEW | Public-site FAQ management |
| GET, PATCH, DELETE | `/faqs/:id` | NEW | Manage and reorder |
| GET | `/reviews` | NEW | All reviews including unapproved |
| PATCH | `/reviews/:id/status` | NEW | Approve or reject before it appears publicly |
| POST | `/reviews` | NEW | Add a testimonial collected offline |
| GET | `/contact-submissions` | NEW | Contact-form inbox |
| PATCH | `/contact-submissions/:id` | NEW | Mark handled, add an internal note |
| GET | `/analytics/summary` | STUB | Customers, active subscriptions, revenue, documents by status |
| GET | `/analytics/revenue` | NEW | Revenue over time, by package and service |
| GET | `/analytics/documents` | NEW | Approval throughput and rejection reasons |
| GET | `/analytics/quotations` | NEW | Conversion from calculation to accepted |
| GET | `/audit-log` | NEW | Cross-module trail from the shared `status_history` table |

---

## 6. System and webhooks

| Method | Path | Auth | Status | Purpose |
|---|---|---|---|---|
| GET | `/health` | none | DONE | Liveness. Deliberately touches no dependency — it drives the container healthcheck |
| GET | `/health/ready` | none | DONE | Readiness. Postgres `SELECT 1` and Redis `PING`, each capped at 2s |
| POST | `/api/webhooks/payments/:provider` | signature | NEW | Gateway callback. Needs the **raw** body for signature verification, so it must be mounted before `express.json()`. Must be idempotent on the provider event id |
| GET | `/api/metrics` | internal | NEW | Queue depth and job failure counts for Phase 8 monitoring |

---

## 7. RBAC matrix

`✓` full access · `own` own records only · `asg` assigned customers only · `r` read-only · `—` denied

| Capability | Customer | Agent | Manager | Admin |
|---|---|---|---|---|
| Public site and calculator | ✓ | ✓ | ✓ | ✓ |
| Own profile | own | own | own | own |
| Any user profile | — | — | r (team) | ✓ |
| Create agent / manager / admin | — | — | — | ✓ |
| Activate / deactivate a user | — | — | — | ✓ |
| Assign customer to agent | — | — | ✓ | ✓ |
| View customers | — | asg | ✓ | ✓ |
| Upload a document | own | — | — | — |
| View / download a document | own | asg | ✓ | ✓ |
| Change document status | — | asg | ✓ | ✓ |
| Manage document categories | — | — | — | ✓ |
| Request a quotation | own | — | — | ✓ |
| Accept a quotation | own | — | — | ✓ |
| Change quotation status | — | — | ✓ | ✓ |
| Service and package catalogue | r | r | r | ✓ |
| Pricing rules and settings | — | — | — | ✓ |
| Subscriptions | own | asg (r) | asg (r) | ✓ |
| Invoices | own | — | r | ✓ |
| Pay an invoice | own | — | — | — |
| Payments and refunds | own (r) | — | r | ✓ |
| Notification log | own | — | r | ✓ |
| Notification templates | — | — | — | ✓ |
| FAQs, reviews, contact inbox | — | — | — | ✓ |
| Analytics and audit log | — | — | r (team) | ✓ |

This matrix now matches the code. Staff can read and download documents, `/api/admin` is
admin-only, and as of 2026-10-14 **`asg` is real for agents**: an agent reads, downloads and changes
the status of documents and quotations only for customers assigned to them, decided in one helper
(`assignmentService.customerScopeFor`) and enforced in one guard
(`document.service.ts` `assertCanReadDocument`). A customer assigned to nobody is invisible to every
agent — assigning them is the step that puts their documents into a review queue.

The manager cells read `✓` rather than `asg (team)` deliberately. **There is no team concept
anywhere in the schema** — no `manager_id` on `users`, no teams table, no branch or region column —
so narrowing a manager would have required inventing one. Managers therefore keep organisation-wide
visibility, and a genuine team boundary is open work that needs a client answer first (it overlaps
the unanswered `docs/client-decisions.md` question "Can agents see only assigned customers, or all
customers in a branch/team?"). Recorded in `docs/decision-log.md` for 2026-10-14.

---

## 8. Cross-cutting rules

**Ownership is enforced in the service layer, never from the request.** A customer-facing
handler derives `customer_id` from `req.user.id`. Agent handlers join through the assignment
table. This is the one rule that, if broken anywhere, turns into a data-leak bug rather than a
403 — so it belongs in a shared helper, not repeated per module.

**Every status change goes through one dispatcher.** Scope §6a applies the same pattern to five
modules. One helper validates the transition against that module's state machine, writes a
`status_history` row, writes `notifications_log`, and enqueues the email job. No route writes a
status column directly and no route sends email inline on the request path.

**Reject unknown transitions loudly.** The existing `document-status.ts` state machine is the
model to generalise: an illegal move returns 409, not a silent write.

**List endpoints are paginated from day one.** Retrofitting pagination after four portals are
built against unpaginated responses is a rewrite of every table component.

**404 versus 403.** For a record that exists but is not yours, return 403 on a direct fetch by
id and omit it from lists. Returning an empty result for a direct fetch makes assignment bugs
indistinguishable from missing data during Phase 4 debugging.

## Account lifecycle, onboarding, document phases, analytics (2026-10-24) — DONE

Account-approval gate: authenticated **customer** routes return 403 `ACCOUNT_PENDING` /
`ACCOUNT_SUSPENDED` unless the account is `approved`. Exceptions: `/auth/*`, `GET /customers/me`,
and `GET|PUT /customers/me/onboarding`. Staff are never gated. Enforced by
`middleware/account-status.ts` on `/api/customers`, `/api/documents`, `/api/quotations`.

Customer (self):
- `GET /api/customers/me/onboarding` — profile + persona list + `completed` flag. **DONE**
- `PUT /api/customers/me/onboarding` — upsert persona, legal/contact name, up to 3 validated
  `notificationEmails` (the phase-email recipients), phone, state, city, needs, and `locale`
  (sets `users.preferred_locale`). **DONE**
- `GET /api/customers/me/dashboard` — now also returns `manager {id,name,email}|null` (the assigned
  manager). **DONE**
- `GET /api/customers/me/documents` — each document now also carries `service {id,nameEn,nameEs}|null`,
  `progress {completed,total,percent}`, `phaseStatuses[]` (ordered), `targetDate`, `nextTargetDate`. **DONE**
- Document versions: the owning customer may now also see and download `phase_result` files (not just the
  official file); `staff_on_behalf` stays hidden. `GET /documents/:id/versions` +
  `/versions/:versionId/{download,preview}-url`. **DONE**

Admin (`/api/admin`, admin only):
- `GET /customers?status=pending_approval&search=&page=&pageSize=` — customers with their
  assigned `managerId`, plus `persona` + `city` from the onboarding profile (null until onboarded).
  **DONE**
- `GET /managers` — managers with their current assigned-customer count
  (`{ id, name, email, customerCount }[]`), for the approve/reassign pickers. Read-only. **DONE**
- `POST /customers/:id/approve` body `{ managerId }` — approve + assign manager (400
  `MANAGER_REQUIRED` if absent); emails the customer. **DONE**
- `POST /customers/:id/suspend` / `POST /customers/:id/reactivate` — flips `account_status`;
  suspend ends live sessions. **DONE**
- `POST /customers/:id/manager` body `{ managerId, reason }` — reassign; writes the log. **DONE**
- `GET /analytics/overview?from=&to=` — KPIs/time-series (§11.9), SQL aggregates, Redis-cached 60s.
  The bare `GET /analytics` stays a **STUB**. **DONE**

Manager workspace (`/api/manager`, manager + admin):
- `GET /manager/customers` — the caller's assigned customers with pending-doc counts + progress. **DONE**
- `GET /manager/customers/:id` — profile + onboarding + subscriptions + documents (with progress)
  + merged timeline; a manager only for their own customers. **DONE**

Document phases (`/api/documents`, phase writes are manager-of-the-customer or admin):
- `GET /documents/phases/statuses` — the phase status contract (any authenticated role). **DONE**
- `GET /documents/:id` — now also returns `phases[]`, `progress {completed,total,percent}`,
  `targetDate` (owning customer or staff). **DONE**
- `POST /documents/:id/phases` body `{ phases?[], order? }` — create (append) and/or reorder. **DONE**
- `PATCH /documents/:id/phases/:phaseId` — edit fields and/or move status (rejection needs a note);
  writes history and emails the customer's onboarding addresses on completed/rejected. **DONE**
- `POST /documents/:id/phases/:phaseId/result-upload-intent` → bytes via the existing
  `POST /documents/:id/versions/:versionId/upload` → `POST /documents/:id/phases/:phaseId/result/:versionId/confirm`
  — uploads the phase result (version kind `phase_result`) and completes the phase. **DONE**

Phase/approval emails go through the existing `email` queue, localized (`en` / `es-MX`) via the
worker's `<template>.<locale>.hbs` resolution and a shared `_layout.hbs` partial.

Homepage CMS — hero carousel + content (`/api/admin/cms`, admin only, audited via `updated_by`):
- `GET /admin/cms/hero-slides` — all slides, ordered by position. **DONE**
- `POST /admin/cms/hero-slides` — multipart: `image` (jpeg/png/webp ≤ 8 MB, magic-byte checked) + an
  optional `data` JSON field of slide metadata (`HeroSlideSchema`). Stores under the public
  `public/hero/` prefix. **DONE**
- `GET /admin/cms/hero-slides/:id` — one slide. **DONE**
- `PATCH /admin/cms/hero-slides/:id` — edit any field (`HeroSlidePatchSchema`). **DONE**
- `PATCH /admin/cms/hero-slides/:id/active` body `{ isActive }` — toggle. **DONE**
- `PATCH /admin/cms/hero-slides/reorder` body `{ ids:[] }` — position = array index. **DONE**
- `DELETE /admin/cms/hero-slides/:id` — removes the row and its image object. **DONE**
- `GET /admin/cms/settings` · `PUT /admin/cms/settings` — hero autoplay/default-duration/transition-ms/
  pause-on-hover/loop + heading/body font + base text scale (fixed allow-lists). **DONE**
- `GET /admin/cms/content` — every registered content key with EN/ES values, status, style. **DONE**
- `GET /admin/cms/content/:key` · `PUT /admin/cms/content/:key` body `{ en, es, style?, publish? }`
  (both locales required to publish, else `VALIDATION_FAILED`; values sanitized + length-capped).
  **DONE**
- `POST /admin/cms/content/:key/publish` body `{ publish }` — publish/unpublish. **DONE**
- `GET /admin/cms/content/:key/history` — append-only published versions. **DONE**

Public CMS reads (`/api/public`, no auth, 60 s `Cache-Control` + `ETag`/304):
- `GET /public/hero?locale=es-MX|en` — active + in-schedule slides (locale-resolved text, timing,
  focal point, overlay) plus the global carousel `settings`. **DONE**
- `GET /public/content?locale=es-MX|en` — published content as a `{ key: { value, fontFamily,
  fontWeight, sizeStep } }` map. **DONE**

On any CMS change the API fires a signed (HMAC-SHA256, header `x-cms-signature`) best-effort
revalidation webhook to `PORTAL_REVALIDATE_URL`; the portal verifies it with a timing-safe compare.





