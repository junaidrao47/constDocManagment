# API Surface — by Portal

Endpoint specification for the Construction & Compliance Service Management Platform.
Companion document: `docs/delivery-plan.md` for phasing and role definitions.

Status markers used throughout:

- **DONE** — implemented and working against the database today
- **STUB** — the route exists and answers, but returns a hardcoded `[]`, `{}` or `total: 0`
- **NEW** — does not exist yet
- **FIX** — exists but is wrong; see the note

All responses use the existing envelope: `{ success: boolean, data: T, message: string }`.
All request bodies are validated with zod per AGENT.md rule 6. All list endpoints take
`?page`, `?limit`, `?sort`, and their own filters; pagination is omitted from the tables
below to keep them readable.

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
| GET | `/services` | STUB | Active services with prices for the Services page |
| GET | `/packages` | STUB | Active packages with their bundled services |
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

Documents (scope §5, §6):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/me/documents` | DONE | Own documents with signed download URLs |
| GET | `/api/documents/:id` | DONE | Single document. Status history arrives with the shared audit trail in Phase 2 |
| POST | `/api/documents/upload-url` | DONE | Create a `pending` row, return a presigned S3 PUT or a local fallback URL |
| POST | `/api/documents/:id/upload` | DONE | Local multipart fallback, constrained by a MIME-plus-extension allow-list and a 25MB ceiling |
| GET | `/api/documents/:id/download-url` | DONE | Signed, time-limited download URL |
| GET | `/api/documents/:id/download` | DONE | Redirect to S3, or stream the local file |
| DELETE | `/api/documents/:id` | NEW | Withdraw an upload, permitted only while `pending` |
| GET | `/me/documents/expiring` | NEW | Documents in `expiring_soon`, for the renewal prompt |

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

Manager-only oversight — `/api/manager`, split out of `/api/admin` so managers stop inheriting
the full admin surface:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/team` | NEW | Agents with their queue depth and throughput |
| GET | `/assignments` | NEW | Current agent-to-customer map |
| POST | `/assignments` | NEW | Assign a customer to an agent |
| DELETE | `/assignments/:id` | NEW | Unassign |
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
| GET, POST | `/services` | NEW | List and create |
| GET, PATCH, DELETE | `/services/:id` | NEW | Detail, update, deactivate |
| GET, POST | `/packages` | NEW | List and create |
| GET, PATCH, DELETE | `/packages/:id` | NEW | Detail, update, deactivate |
| PUT | `/packages/:id/services` | NEW | Replace the bundled service set (`package_services`) |
| GET, POST | `/industries` | NEW | List and create |
| GET, PATCH, DELETE | `/industries/:id` | NEW | Includes the pricing weight added in Phase 3 |

Pricing configuration (scope §4 — "no pricing logic will be hardcoded"):

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET, POST | `/pricing/worker-ranges` | STUB | POST exists as a placeholder; GET does not exist |
| PATCH, DELETE | `/pricing/worker-ranges/:id` | NEW | Edit or retire a band |
| GET, POST | `/pricing/locations` | STUB | State, city, multiplier, city fee |
| PATCH, DELETE | `/pricing/locations/:id` | NEW | Edit or retire |
| POST | `/pricing/locations/import` | NEW | CSV import — states and cities entered by hand will not scale |
| GET, PATCH | `/settings` | NEW | Quotation validity days, reminder lead times, currency, tax rate. No settings table exists |
| POST | `/pricing/preview` | NEW | Dry-run the engine against draft rules before publishing them |

Quotations, documents and categories:

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/quotations` | NEW | All quotations, filterable by status, customer and date |
| GET | `/quotations/:id` | NEW | Detail with line items |
| PATCH | `/quotations/:id/status` | NEW | Override the lifecycle status |
| GET | `/quotations/:id/history` | NEW | Audit trail |
| GET | `/documents` | STUB | All documents, filterable by status, customer, category, expiry |
| GET | `/documents/:id` | NEW | Detail with history |
| PATCH | `/documents/:id/status` | STUB | Duplicate of the shared route; should delegate, not reimplement |
| GET | `/documents/expiring` | NEW | Expiry pipeline view |
| GET, POST | `/document-categories` | NEW | Scope §6 categorisation. No category column exists yet |
| GET, PATCH, DELETE | `/document-categories/:id` | NEW | Manage the taxonomy |

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
| View customers | — | asg | asg (team) | ✓ |
| Upload a document | own | — | — | — |
| View / download a document | own | asg | asg (team) | ✓ |
| Change document status | — | asg | asg (team) | ✓ |
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

Both rows that used to contradict the code are now aligned with it: staff can read and download
documents, and `/api/admin` is admin-only. The remaining gap in this matrix is `asg` — agents and
managers are currently granted the same document visibility as an admin, because there is no
assignment table to narrow it against. Phase 4 turns `✓` back into `asg` in one service helper.

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





