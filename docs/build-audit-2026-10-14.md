# ConstDoc — Module-by-Module Build Audit & Remaining-Work Plan

**Date:** 2026-10-14 · **Method:** read the code, not the docs · **Repos:** `constDocManagment` (API + worker), `customer-portal` (public site + customer portal), `admin-frontend` (admin + staff portal).

> **Status of this document.** For *where the project stands*, this supersedes `docs/delivery-plan.md`, which has not been updated since 2026-09-16 and still describes the frontend as unbuilt. `delivery-plan.md` remains the record of what was *planned*; `docs/api-surface.md` remains the endpoint specification. Every completion figure here is **static analysis** — `npm run smoke`, the authoritative gate, could not run because Docker was down. See §0.

## Context

**Why this exists.** You asked for a code-truth audit of ConstDoc across three repos, per module, with completion percentages, a dependency graph, a 60%-scope cut, client blockers, and every deviation from the scope doc. The driver is that `docs/delivery-plan.md` is stale — it is dated **2026-09-03**, claims "the frontend is 0%, there are zero `.tsx` files", and describes a planned fifth container at `apps/web`. All three statements are now false: two separate Next.js repos exist. Today is **2026-10-14**; the plan's 8-week hard cap from its 2026-09-03 baseline expires around **2026-10-29**, i.e. ~2 weeks out.

**Intended outcome.** A single document that (a) states what is actually built, (b) is honest about what the tests can and cannot prove, and (c) gives a dependency-ordered backlog of single-PR tasks so the remaining ~2 weeks are spent on the right 60%.

### Things to correct before reading

| You said | Reality |
|---|---|
| repo `constdoc-customer-portal` | `E:\ConstructionWebsite\customer-portal` |
| repo `constDocAdmin` | `E:\ConstructionWebsite\admin-frontend` |
| `CLAUDE.md`, `docs/*.md` at root | they live under `constDocManagment/` (each frontend has its own `CLAUDE.md`) |

### Decisions you made during this audit

1. **Scope baseline** — you will supply the real *MJPRODS Project Requirements & Scope Document v1.0 (Final)*. It is **not in the repo**. Everything in §Deviations and §60% Slice below is therefore measured against `docs/delivery-plan.md` + `docs/api-surface.md` as an **interim** baseline and must be re-checked against the real doc when it lands.
2. **"60% of scope"** = ship a coherent, demoable 60% product slice; explicitly defer the rest.
3. **Payments** — the online gateway is **still in scope**. The code has drifted to offline-only and must be brought back.
4. **The `catalog` module** — treated as unscoped extra work. Excluded from completion maths, listed under Deviations.

---

## 0. Verification status — what I actually ran

| Check | Command | Result |
|---|---|---|
| API typecheck | `apps/api$ npm run typecheck` | **PASS** (exit 0) |
| API test typecheck | `apps/api$ npm run typecheck:test` | **PASS** (exit 0) |
| API unit/integration tests | `apps/api$ npm test` | **PASS — 11 suites, 120/120 tests, 87.7 s** |
| Worker typecheck | `apps/worker$ npx tsc --noEmit -p .` | **PASS** (exit 0) |
| **`npm run smoke`** | needs a live API + real Postgres | **NOT RUN — Docker Desktop is not running** on this machine (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`), and `curl localhost:3001/health` is refused. |

### The single most important caveat in this document

`apps/api/jest.config.js` maps the data source, Redis, email and the email queue to in-memory fakes. **A green `npm test` is not evidence that any persistence change works.** `CLAUDE.md:20` records that this exact blind spot has already produced **four production bugs** — all 120 tests passed while payments could not be inserted at all, staff quotations could not be inserted at all, and `quotation_items` was empty for every quotation in existence.

`npm run smoke` is the real gate and it **doubles as the delivery scoreboard** (unbuilt steps print `SKIP <phase>`). Because Docker is down I could not run it. **Every completion percentage below is a static-analysis estimate, not a verified one.** Start Docker and run `npm run smoke` before trusting any number here.

The smoke script already encodes four known-missing steps (`apps/api/src/scripts/smoke.ts`):

- `SKIP story 4 — a package quotes at its own price` (phase 1.4)
- `SKIP story 6 — the payment activates a subscription` (phase 4.1)
- `SKIP story 7 — customer resubmits as a new version` (phase 5.1)
- `SKIP story 7 — required-documents checklist` (phase 5.2)

---

## 1. Deviations from the scope doc

Measured against `docs/delivery-plan.md` §2/§3/§4/§6 and `docs/api-surface.md`. **Re-check against the real MJPRODS Scope v1.0 when you supply it.**

### 1a. Deliberate, documented deviations (decision-log has the rationale)

| # | Scope says | Code does | Where | Severity |
|---|---|---|---|---|
| D1 | §11 "JWT-based authentication, **HTTP-only cookies**" | Bearer tokens in the JSON body. No `res.cookie` anywhere, `cookie-parser` not installed, no CSRF defence. `authenticate.ts:43-50` requires an `Authorization: Bearer` header. | `apps/api/src/middleware/authenticate.ts` | **High** — this was "Decision A" in delivery-plan §4 and was never taken. |
| D2 | §6a Payments: status **Pending / Confirmed / Failed** | `payments.status` was **deliberately dropped**. `PaymentEntity` has no status property; payment state is derived from the invoice. | migration `1830000000000-FixSchemaDrift.ts:27-31`, `modules/payments/payment.entity.ts` | **High** — you confirmed the gateway is still in scope, so this must be reversed. |
| D3 | §9 online payment gateway | No gateway at all. `PaymentMethod` = `bank_transfer / spei / cash / other`. No webhook route, no provider SDK, no `provider`/`provider_ref`/idempotency columns. | `modules/payments/payment.entity.ts:5-10`; `apps/api/src/app.ts` has no `/api/webhooks` mount | **High** |
| D4 | §6a Invoices: **Pending / Paid / Overdue / Cancelled** (4 states) | `InvoiceStatus` has **6**: `draft, issued, partially_paid, paid, overdue, cancelled`. Partial payment is supported, which §8 q6 asks about but nobody answered. | `entities/invoice.entity.ts:9-16` | Medium — arguably an improvement, but it is an unapproved contract change. |
| D5 | Phase 2: **one generic `status_history` table** for all five modules | Two separate per-module tables: `document_status_history` and `quotation_status_history`. Subscriptions, invoices and payments have **no audit table at all**. | `entities/document-status-history.entity.ts`, `entities/quotation-status-history.entity.ts` | **High** — delivery-plan §8 ranks building this per-module instead of once as the #3 timeline risk. The cross-module `GET /api/admin/audit-log` is impossible without it. |

### 1b. Silent deviations (no decision-log entry found)

| # | Scope says | Code does | Where |
|---|---|---|---|
| D6 | §6a Quotation lifecycle: Draft → Sent → Under Review → Accepted → Expired (5 states) | **8** states: adds `rejected`, `converted`, `cancelled`. `accepted` → `converted` is the only move out of accepted. | `modules/quotations/quotation-status.ts:3-12` |
| D7 | Phase 2: "four Postgres enums … plus defaults on the four columns that currently have none" | **Zero** of the four were created. `quotations.status`, `subscriptions.status`, `invoices.status` are all unconstrained `varchar(50)`; only `subscriptions.status` got a default (`1830`). No CHECK constraints. | `1700000000000-InitialSchema.ts`; `1830000000000-FixSchemaDrift.ts:33` |
| D8 | api-surface §8: "**List endpoints are paginated from day one.** Retrofitting pagination after four portals are built against unpaginated responses is a rewrite of every table component." | Only **3** endpoints paginate (`findAndCount`): admin users, admin documents, admin invoices. Everything else returns an unbounded array — including `GET /api/admin/quotations`, `/api/agent/quotations`, `/api/agent/documents`, every `/api/public/*`, every `/api/customers/me/*`, admin packages/services/industries/locations/worker-ranges. | `grep findAndCount` across `modules/*/*.service.ts` |
| D9 | §5 customer "notification centre"; api-surface §3 `GET /me/notifications`, unread-count, mark-read, preferences | `notifications_log` has **no read endpoint anywhere** and **no `read_at` / `title` / `body` / `payload` columns**, so an in-app feed with read state cannot be built on it without a migration. | `entities/notification-log.entity.ts`; no route in `customer.router.ts` |
| D10 | §6.2 q7 "Can a customer resubmit a rejected document?" | `rejected` is a **terminal** state in `DOCUMENT_STATUS_FLOW`. No resubmit route, no version concept. Smoke prints `SKIP story 7`. | `modules/documents/document-status.ts:25` |
| D11 | api-surface §4 `GET /api/agent/documents/:id/history`, §5 `GET /api/admin/quotations/:id/history` (quotations ✓) | Quotation history exists; **document history has no endpoint** — `documentService` has no `history()` method despite `document_status_history` being fully populated. | `modules/documents/document.service.ts` |
| D12 | §4 "no pricing logic will be hardcoded"; delivery-plan: packages are a pricing input | The pricing engine reads **only** `worker_ranges`, `locations`, `services`, `industries.price_weight`. `packages.price` is never used in a calculation — `recommendedPackage` is hardcoded `null`. Smoke prints `SKIP story 4 — a package quotes at its own price`. | `modules/quotations/pricing.engine.ts:120` |
| D13 | §6a accepted quotation "triggers subscription and invoice creation" (api-surface §3) | Accepting a quotation creates **neither**. Invoicing is a separate manual admin call (`POST /api/admin/quotations/:id/invoice`). **No code anywhere creates a subscription** — `subscription.service.ts` is `return null`. Smoke prints `SKIP story 6 — the payment activates a subscription`. | `modules/quotations/quotation.service.ts:252-285`; `modules/subscriptions/subscription.service.ts` |
| D14 | §3 public site: customer reviews, FAQs, contact form; `GET /api/public/faqs`, `/reviews`, `POST /contact`, `GET /settings` | **No entity, no table, no route** for any of the four. The `faq` and `contact` pages in the customer portal are therefore static. | `entities/index.ts` — no `faq`/`review`/`contact` export |
| D15 | §6 "document categorization" | No `document_categories` table, no category column. Only a nullable `service_id`, which is a service reference, not a taxonomy. | `modules/documents/document.entity.ts` |
| D16 | §8 agent sees "**assigned** customers" | **No assignment concept exists.** `assertCanReadDocument` returns early for agent/manager/admin with `// TODO(phase-4)`, so **every agent can read every customer's documents**. No `/api/manager` router, no assignment table, no `GET /api/agent/customers`. | `modules/documents/document.service.ts:142-150`; `app.ts` has no `/api/manager` mount |
| D17 | api-surface §2: the public mounts "should move under `/api/public`" | `/api/quotations` is still mounted at the top level (authenticated). `publicService.listPackages()` also does **not** filter inactive — `packages` has no `is_active` column at all. | `app.ts:125`; `modules/public/public.service.ts:36-40` |
| D18 | AGENT.md rule 4: "All secrets and runtime config must come from environment variables" (via validated config) | `WEB_URL` is read as raw `process.env.WEB_URL ?? ""` in two places, bypassing the validated schema. It is **absent from `.env.example` and from `.env`**, so password-reset and notification emails contain the bare relative link `"/portal/documents"`. Compounds the known `/portal/` vs `/dashboard/` route mismatch in `CLAUDE.md:18`. | `modules/documents/document.service.ts:407`; `modules/notifications/notify.service.ts:109` |
| D19 | — | **The `catalog` module is in no scope document**: 5 tables (`catalog_categories`, `catalog_items`, `catalog_fields`, `catalog_field_values`, `catalog_images`), ~530 LOC, 24 routes. It duplicates `services` / `packages` / `industries` and the pricing engine does not read it. Per your decision: unscoped extra. | `modules/catalog/*` |
| D20 | §13/§16 production: CI/CD, SSL, backups | `.github/workflows/deploy.yml` **was deleted** in commit `5e9e58d` and replaced by nothing. **Nothing deploys anywhere.** No database backup of any kind. 443 is published with no listener. The two frontends have **no CI at all** (`.github/` in each contains only an instructions markdown file). | see §Deployment |

### 1c. Redundancy / hygiene findings (not scope deviations)

- Migrations `1761000000000-AdminPricingConfig` and `1780000000000-PricingGuardrails` are **near-duplicates** — both add `industries.is_active` + `price_weight` and both `CREATE TABLE IF NOT EXISTS app_settings` with the same two default rows. Idempotent, so harmless, but confusing.
- `MAIL_FROM` is declared **twice** in `.env` (line 56 empty, line 59 set). Last-wins, so it happens to work.
- `nodemailer` + `@types/nodemailer` are dependencies in **both** api and worker with **zero** references in either `src/` — dead weight in both production images.
- The SES transport is **duplicated** in `apps/api/src/utils/email.ts` and `apps/worker/src/utils/email.ts` and will drift.
- `S3_BACKUP_BUCKET` is validated in both apps and read by **nothing**.
- `docs/aws-s3-policy.json:11` scopes S3 permissions to `documents/*`, but `saveCatalogObject` writes keys like `items/<uuid>/main/<uuid>.png`. With `S3_BUCKET` set, **every catalog image upload fails with AccessDenied**. The policy also omits `s3:DeleteObject`, and `removeCatalogObject` silently no-ops when S3 is configured — **S3 catalog objects are never deleted and leak**.

---

## 2. Client blockers

All of these stop work; none is a development task. `Requirements_Clarification_Questionnaire.md` has **16 sections and every one is still blank**, and `docs/client-decisions.md` lists 7 topics with **zero answers**.

| # | Blocker | Blocks | Why it is urgent |
|---|---|---|---|
| C1 | **Payment gateway + credentials** (`client-decisions.md` "Invoices and payments" q1-2) | the whole payments/subscriptions chain; the customer "pay invoice" flow | delivery-plan §8 ranks this the **#1 timeline risk**. You have confirmed the gateway is in scope, so with ~2 weeks left this is the critical path. Ask in writing today. |
| C2 | **The signed scope document itself** | the 60% cut, the deviation list, acceptance criteria | MJPRODS Scope v1.0 is not in the repo. Every percentage here is provisional without it. |
| C3 | **Pricing rules** (worker bands + base prices, per-industry multipliers, per-city multiplier + fee, quote validity days, tax inclusive/separate) | the public calculator being *correct* rather than merely *working* | the engine works; the numbers in it are demo seed data (CDMX ×1.15 fee 3500, etc.). Shipping a calculator with invented prices is worse than not shipping it. |
| C4 | **Subscription model** (plans, billing periods, auto vs manual renewal, cancel semantics, upgrade/downgrade/proration) | all subscription work — which is currently **0%** | `subscription.service.ts` is `return null`. There is nothing to build against until this is answered. |
| C5 | **Document categories** + which document types require an expiry date + accepted file types/size + whether rejection notes are mandatory | document categorisation, the expiry cron, the review UI | §6 asks for categorisation; no taxonomy exists. |
| C6 | **Assignment rules** (can one customer have multiple agents? agents see assigned-only or whole branch? who may assign?) | the entire agent/manager boundary — currently every agent sees every customer | this is a **live data-exposure gap** (D16), not just missing UI. |
| C7 | **Verified sender address + email branding/language**, and how many reminders before each expiry | SES exit from sandbox; all 8 notification categories | `docs/aws-ses-policy.json` pins `ses:FromAddress` to `noreply@grupog2h.com`; nothing in code or env validation enforces that `MAIL_FROM` matches, so a mismatch = every send denied. |
| C8 | **Does acceptance auto-create subscription + invoice?** Can staff edit a sent quotation? | quotation→invoice→subscription cascade (D13) | the code currently requires a manual admin click; the scope implies automatic. |
| C9 | **Public site content** (service copy, package contents, FAQs, reviews, business info) | public website pages beyond the shell | §14 makes content the client's responsibility; §12 makes delay their timeline cost. |
| C10 | **Cookie vs bearer auth** (delivery-plan §4 Decision A) | D1; CSRF strategy; both frontends' auth layer | scope §11 promised cookies. If you ship bearer, get it accepted in writing — it is a signed-scope deviation, and changing it later touches every page in both frontends. |
| C11 | **Hosting target + domain + TLS** (§13 q2/q5) | the entire deploy pipeline | nothing deploys anywhere today and there is no domain to issue a certificate for. |
| C12 | **Backup/retention requirements** (§13 q6) | backup cron design | there are currently **no backups of any kind** for a platform whose whole purpose is storing client compliance documents. |

---

## 3. Route inventory — the full mounted API surface

`apps/api/src/app.ts` mounts exactly these. Note what is **absent**: `/api/subscriptions`, `/api/payments`, `/api/invoices`, `/api/manager`, `/api/webhooks`, `/api/metrics` — all 404.

| Mount | Guard | Source |
|---|---|---|
| `/api/auth` | none (+ tighter rate limit on login/register/forgot/reset) | `modules/auth/auth.router.ts` — 6 routes |
| `/api/users` | `authenticate` | `modules/users/user.router.ts` — `GET /me`, `PATCH /me` |
| `/api/customers` | `authenticate` + `authorize(Customer)` | `modules/customers/customer.router.ts` — 10 routes |
| `/api/documents` | `authenticate` + per-route role gate | `modules/documents/document.router.ts` — 8 routes |
| `/api/agent` | `authenticate` + `authorize(Agent, Manager)` | `modules/agent/agent.router.ts` — 5 routes |
| `/api/public` | none | `modules/public/public.router.ts` — 6 routes |
| `/api/public/catalog` | none | `modules/catalog/catalog.router.ts` — 4 routes **(unscoped)** |
| `/api/quotations` | `authenticate` | `modules/quotations/quotation.router.ts` — `GET /:id`, `GET /:id/pdf` |
| `/api/admin` | `authenticate` + `authorize(Admin)` | `modules/admin/admin.router.ts` — 42 routes |
| `/api/admin/catalog` | `authenticate` + `authorize(Admin)` | `modules/catalog/catalog.router.ts` — 20 routes **(unscoped)** |
| `/health`, `/health/ready` | none | `app.ts:135`, `app.ts:145` |

`modules/payments/payment.router.ts` and `modules/subscriptions/subscription.router.ts` are literally `export const x = {}` — one line each, not mounted.

---

## 4. Module-by-module

Legend: **REAL** = DB-backed and working · **PARTIAL** = works but missing required behaviour · **STUB** = route/file exists and returns a placeholder · **MISSING** = does not exist.

### 4.1 Auth and users — dep: **independent** (everything depends on it)

**Backend: REAL.** `modules/auth/auth.service.ts` (421 L), `session.ts` (190 L), `token.ts`, `auth.router.ts`. Six endpoints: register, login, refresh (with rotation), logout, forgot-password, reset-password. `modules/users/user.service.ts` adds `GET/PATCH /api/users/me`. Admin user CRUD in `admin-user.service.ts` (207 L): list (paginated), create (the only route to a non-customer account), get, patch, patch status.

Security posture is genuinely good: `authenticate.ts` verifies signature → asserts `typ === "access"` → **loads the live user row** (Redis-cached) so a demotion or deactivation takes effect on the next request; `authorize()` is typed against `UserRole` so a role typo is a build error; `STAFF_ROLES` is a named constant. All nine Phase-1 defects in delivery-plan §3 appear closed.

**Missing endpoints:** `POST /api/auth/change-password`, `GET /api/auth/session` (only needed if cookies land), `POST /api/admin/users/:id/force-reset`, `DELETE /api/admin/users/:id` (soft delete).

**Database: REAL.** `users` (+ `tokens_valid_from` from `1700000001000`, `manager` role from `1700000002000`), `refresh_tokens`. No drift found.

**UI:** admin login + staff login + a generic login (3 pages in `admin-frontend`), customer login + register in `customer-portal`. **Missing everywhere:** forgot-password, reset-password, change-password, profile edit. See §5/§6 for exact paths.

**Tests:** `test/auth-reset-token.test.ts` (7), `test/phase1-gate.test.ts` (16), `test/no-user-secrets.test.ts`. All pass.

**Completion: backend 90%** (6/8 auth + 5/7 admin-user endpoints, and the hard parts — rotation, session invalidation, reset-token hygiene — are done). **Frontend ~45%** (you can log in; you cannot recover a password or edit a profile).

| Task | Acceptance | Size |
|---|---|---|
| `POST /api/auth/change-password` | authenticated, requires current password, revokes other sessions, test covers wrong-current-password → 400 | **S** |
| Forgot/reset password pages in both frontends | submitting an email always shows the same confirmation; the emailed link lands on a working reset form; absolute URL (needs `WEB_URL`) | **S** |
| `POST /admin/users/:id/force-reset` + `DELETE /admin/users/:id` (soft) | force-reset emails a token and invalidates sessions; soft delete hides the user from lists without cascading across 7 tables | **M** |
| Decide + implement D1 (cookie vs bearer) | **blocked on C10.** If cookies: `httpOnly; Secure; SameSite`, CSRF token, `GET /session`, exact `CORS_ORIGIN` per portal, and both frontends' auth layer reworked | **L** |

### 4.2 Customers — dep: auth

**Backend: REAL.** `modules/customers/customer.service.ts` (166 L) + router (89 L). `GET /me`, `GET /me/dashboard` (profile + stats + last-5 documents/subscriptions/invoices + an `attention` block), `GET /me/documents`, `GET /me/subscriptions`, `GET /me/invoices`, `GET /me/invoices/:id`, plus 5 quotation routes. Ownership is derived from `req.user.id` throughout — no endpoint accepts a customer id.

**Missing:** `GET /me/documents/expiring`, `GET /me/payments`, all 5 notification routes, `GET /me/subscriptions/:id`, renew, cancel, `POST /me/invoices/:id/pay`, invoice PDF.

**Database: REAL** (reuses `users`). No separate customer profile table — company name, RFC/tax id, address are **not stored anywhere**, which §3 of the questionnaire implies are needed for a quotation lead.

**UI:** customer dashboard at `customer-portal/src/app/(portal)/dashboard/page.tsx`. **No profile page.** Admin-side customer list at `admin-frontend/src/app/(staff)/customers/page.tsx`; **no customer detail route**.

**Tests:** covered inside `test/public-and-portal.test.ts` (4).

**Completion: backend 70%** · **frontend ~40%**.

| Task | Acceptance | Size |
|---|---|---|
| `GET /api/customers/me/payments` | returns the caller's payments joined through their invoices, paginated, 403-free for other customers' rows | **S** |
| `GET /api/customers/me/documents/expiring` | returns `expiring_soon` + `expired`; drives the renewal prompt | **S** |
| Customer profile page + `PATCH /api/users/me` wiring | name/phone/email editable; email uniqueness error surfaces inline | **S** |
| `GET /api/agent/customers/:id` + admin/staff customer detail page | 403 (not 404, not empty) when the caller is not assigned — **depends on assignments (4.3)** | **M** |

### 4.3 Assignments — dep: auth, customers · **nothing exists**

**Backend: MISSING.** Zero `assign` matches outside comments. No `/api/manager` router. No `GET /api/agent/customers`. `assertCanReadDocument` (`document.service.ts:142-150`) returns early for agent/manager/admin with `// TODO(phase-4)`.

**This is a live data-exposure gap, not just missing UI:** any agent account can read, download and approve **every** customer's documents. `docs/api-surface.md:353-356` acknowledges it ("agents and managers are currently granted the same document visibility as an admin").

**Database: MISSING.** No `agent_customer_assignments` table, no column.

**UI: MISSING** in both repos. `admin-frontend/src/app/(staff)/oversight/page.tsx` exists and may be the intended home — see §5.

**Tests:** none.

**Completion: backend 0% · frontend 0%.**

| Task | Acceptance | Size |
|---|---|---|
| `agent_customer_assignments` table + entity + migration | `(agent_id, customer_id)` unique, FKs cascade on user delete, `assigned_by`, `assigned_at`; **verified with `npm run smoke`, not `npm test`** | **S** |
| `/api/manager` router: `GET/POST /assignments`, `DELETE /assignments/:id`, `GET /team` | manager-only; `POST` rejects assigning a non-customer or a non-agent; re-assigning the same pair is idempotent | **M** |
| Narrow `assertCanReadDocument` to assigned customers | an unassigned agent gets **403 on a direct fetch by id** and the document is **omitted from lists**; admin unaffected; manager sees the whole team. Test both halves. | **M** |
| Scope `/api/agent/quotations` and `/api/agent/documents` to assignments | same rule, same single helper | **S** |
| Manager assignment UI + agent "my customers" page | a manager can assign a customer and that agent's queue populates without a DB client | **M** |
| `POST /assignments/bulk` + `GET /reports/workload` | reassign a departing agent's book in one call; workload distribution across the team | **M** |

### 4.4 Catalog (services, industries, locations, worker ranges) — dep: auth

**Backend: REAL.** `admin-pricing.service.ts` (399 L) gives full CRUD + deactivate for all four, with an overlap guard on worker ranges. Public read for all four in `public.service.ts`. `industries.price_weight` is real and **is** used by the engine.

**Missing:** `POST /admin/locations/import` (CSV — states and cities by hand will not scale), `GET /public/locations/states`, `GET /public/locations/cities?state=`.

**Database: REAL.** `services`, `industries` (+`is_active`, `price_weight`), `locations`, `worker_ranges`. No drift.

**UI:** **MISSING entirely in `admin-frontend`** — there is no `services`, `industries`, `locations` or `worker-ranges` route. This is the single biggest admin gap: the pricing configuration API is complete and **unreachable from the browser**, which is exactly what delivery-plan's Phase-7 gate forbids.

**Tests:** `test/admin-pricing.test.ts` — **42 tests**, the best-covered module in the repo. All pass.

**Completion: backend 90% · frontend 0%.**

| Task | Acceptance | Size |
|---|---|---|
| Admin CRUD pages for services, industries, worker ranges, locations | create/edit/deactivate each from the browser; worker-range overlap error surfaces; changing a location multiplier changes the next quote with no deploy | **L** (split per entity → 4 × **M**) |
| `GET /api/public/locations/states` + `/cities?state=` | the calculator's state→city cascade works without downloading every location | **S** |
| `POST /api/admin/locations/import` (CSV) | idempotent on `(state, city)`; reports per-row errors; a 2000-row file completes | **M** |

### 4.5 Packages — dep: catalog

**Backend: PARTIAL.** `package.service.ts` (69 L) + 5 admin routes: list, get, create, patch, delete (refuses while subscriptions reference it). `PUT /packages/:id/services` is not separate — the service set is replaced via the create/patch body, which is functionally equivalent.

**Real gap (D12):** `packages.price` is never used in a calculation. `pricing.engine.ts` returns `recommendedPackage: null` hardcoded. Smoke prints `SKIP story 4 — a package quotes at its own price`. **`packages` also has no `is_active` column**, so `publicService.listPackages()` returns drafts and retired packages to the public site.

**Database: PARTIAL.** `packages` + `package_services` join table exist. Missing: `is_active`, `description`, `is_featured`, display order — all needed by a public packages page.

**UI:** public packages page at `customer-portal/src/app/packages/page.tsx`. **No admin package management page.**

**Tests:** none specific to packages.

**Completion: backend 65% · frontend ~30%.**

| Task | Acceptance | Size |
|---|---|---|
| `packages.is_active` + `description` + `sort_order` migration; filter public list | retired packages disappear from `/api/public/packages`; admin still sees them | **S** |
| Price a package through the engine | `POST /public/quotations/calculate` with a `packageId` returns the package price path, and `recommendedPackage` names a real package; **smoke story 4 stops printing SKIP** | **M** |
| Admin package management page | create a package, pick its services, set price/duration, deactivate; delete blocked with a readable 409 while subscriptions reference it | **M** |

### 4.6 Pricing engine and settings — dep: catalog

**Backend: REAL.** `pricing.engine.ts` (129 L) is a pure function — `workerBasePrice × locationMultiplier × industryWeight + serviceTotal + cityFee`. It is wired to `POST /api/public/quotations/calculate` (the delivery-plan's complaint that "no HTTP route calls it" is **fixed**). `app_settings` is a real jsonb key-value table with a whitelisted, per-key-typed update schema (`currency`, `quote_validity_days`, `payment_terms_days`) and `GET /admin/settings` + `PUT /admin/settings/:key`.

**Missing:** `POST /admin/pricing/preview` (dry-run draft rules before publishing).

**Database: REAL.** `app_settings` with FK to users on `updated_by`.

**UI: PARTIAL (public), MISSING (admin).** The calculator exists as a **component**, not a route — `customer-portal/src/components/pricing-calculator.tsx`, rendered on `/services` and `/`. It does make the real API call. But it is **functionally fake on its most important input**: `services.data?.slice(0, 1).map(...)` (`pricing-calculator.tsx:45`) silently quotes **only the first service in the catalogue** regardless of what the visitor wants, there is no worker-range picker, there is **no "save as quotation" CTA**, and it reads only `result.total`, discarding the `currency`, `subtotal`, `cityFee` and `serviceCharges` the API returns (`:48`). The copy at `:65-67` asserts "The API calculates from configured database pricing" while the service list is hardcoded to index 0.

On the admin side: **no settings editor, no pricing-rules page at all** in `admin-frontend`.

**Tests:** `test/admin-pricing.test.ts` includes `describe("pricing engine: industry weight and dynamic settings")`. Pass. The calculator component has **no frontend test**.

**Completion: backend 90% · frontend ~30%** (real plumbing, wrong inputs, no conversion step).

| Task | Acceptance | Size |
|---|---|---|
| **Service multi-select + full breakdown in the calculator** | checkbox list of all `/public/services`; `serviceIds` comes from the selection, never `slice(0,1)`; button disabled at zero selected; renders `subtotal`, `cityFee`, per-service `serviceCharges` and uses the response's `currency` | **M** — *highest-value single frontend task in the project; the lead-gen surface is currently quoting the wrong price* |
| **"Save this estimate" → a real quotation** | logged out → `/login?next=…` and resume; logged in → `POST /customers/me/quotations` then route to `/dashboard/quotations/:id`. Closes the calculator→quotation gap (`POST /customers/me/quotations` exists and is **never called**) | **M** |
| Admin settings editor | change `quote_validity_days` and `currency` from the browser; the next quote reflects it with no deploy | **S** |
| `POST /api/admin/pricing/preview` | accepts draft rule overrides and returns the resulting price without persisting | **S** |

### 4.7 Quotations — dep: pricing, catalog, notifications

**Backend: REAL** and the most complete business module. `quotation.service.ts` (291 L): customer `create`, `staffCreate` (with `gov_fee` / `discount` extra lines, cents-exact arithmetic, discount-cannot-exceed-subtotal guard), `list`, `get`, `transition` (state machine + history + notification), `history`, lazy `expireIfNeeded`. 14 JSON endpoints across admin/agent/customer. PDF at `GET /api/quotations/:id/pdf` via a hand-rolled minimal PDF writer (`utils/quotation-pdf.ts`, 36 L) — valid but plain, and it prints `item.price` with no currency and no label.

`toPublicUser()` sanitising is in place after the password-hash leak (`f3738b8`).

**Gaps:** D6 (8 states vs 5), D7 (no enum/CHECK), D8 (no pagination on any quotation list), D13 (accept creates nothing).

**Database: REAL.** `quotations` + `quotation_items` (`cascade: ["insert"]` — load-bearing, see `CLAUDE.md:21`) + `quotation_status_history`. Entity↔migration aligned as of `1830`.

**UI:** customer list + detail (`(portal)/dashboard/quotations/page.tsx`, `[id]/page.tsx`), admin list (`(admin)/admin/quotations/page.tsx`), staff list (`(staff)/quotations/page.tsx`).

**Tests:** `test/staff-quotations.test.ts` (13, incl. `describe("status transition rules")`), `test/status-notifications.test.ts` (2), `test/no-user-secrets.test.ts`. Pass.

**Completion: backend 85% · frontend ~55%.**

| Task | Acceptance | Size |
|---|---|---|
| Paginate every quotation list (D8) | `?page`/`?limit`/`?sort` on admin, agent and customer lists; **do this before more table UI is built on unpaginated responses** | **S** |
| `quotation_status_enum` + CHECK + default migration (D7) | an invalid status cannot be inserted by raw SQL; verified against real Postgres with `npm run smoke` | **S** |
| Auto-create invoice (+ subscription) on accept (D13) | **blocked on C8.** Accepting produces exactly one invoice; replaying the accept changes nothing; smoke story 6 stops printing SKIP | **M** |
| Improve the quotation PDF | line labels, quantity, unit price, line total, MXN formatting, company header; invoice PDF reuses the same writer | **S** |
| `POST /api/public/quotations/request` | converts an anonymous calculation into a `Draft` quotation + captures the lead. **Blocked on C3 q7** (what contact fields are required) | **M** |

### 4.8 Invoices — dep: quotations

**Backend: PARTIAL-to-REAL.** `invoice.service.ts` (208 L): `createFromQuotation` (transactional, `SELECT … FOR UPDATE`, `invoice_number_counters` sequence producing `INV-YYYY-NNNN`, reads `payment_terms_days` from settings, flips the quotation to `converted`), `listAdmin` (paginated, with overdue folding), `getAdmin`, `listCustomer`, `getCustomer`, `recordPayment`, `cancel`. Lazy `applyOverdue` on read.

**Missing:** `POST /admin/invoices` (raise standalone), `PATCH /admin/invoices/:id`, `PATCH /admin/invoices/:id/status`, `POST /admin/invoices/:id/send`, `GET /me/invoices/:id/pdf`, `POST /me/invoices/:id/pay`.

**Database: REAL.** `invoices` (+ `quotation_id` unique-when-not-null, `invoice_number` unique, `currency`, `subtotal`, `tax_amount` from `1810`) + `invoice_number_counters`. ⚠️ `invoice_number_counters` is a **real table with no entity** — it is only touched by raw SQL. That is the exact drift shape `CLAUDE.md:21` warns about; it works today but nothing keeps it honest.

**UI:** customer billing page at `(portal)/dashboard/billing/page.tsx`. **No admin invoice page.**

**Tests:** `test/invoices.test.ts` (6). Pass.

**Completion: backend 70% · frontend ~30%.**

| Task | Acceptance | Size |
|---|---|---|
| Admin invoices page (list, detail, record payment, cancel) | an admin can see every invoice, filter by status/overdue, record a SPEI payment and cancel an unpaid one — no DB client | **M** |
| `POST /admin/invoices/:id/send` | emails the invoice through the notification dispatcher (never inline); writes one `notifications_log` row | **S** |
| Invoice PDF + `GET /me/invoices/:id/pdf` | reuses the quotation PDF writer; shows line items, tax, total, due date | **S** |
| `invoice_status_enum` + CHECK (D7) | as 4.7; keep all 6 current values or reduce to the scope's 4 — **decide with the client (D4)** | **S** |

### 4.9 Payments — dep: invoices · **gateway 0%**

**Backend: PARTIAL.** Only one real path: `POST /api/admin/invoices/:id/payments` → `invoiceService.recordPayment`. It is well built — transactional, cents-exact, refuses to exceed the remaining balance, flips the invoice to `paid`/`partially_paid`. `modules/payments/payment.router.ts` and `payment.service.ts` are **one-line stubs** and not mounted.

**Against your decision that the gateway is in scope, this module is the furthest from done:** no `payments.status` (dropped in `1830`), no provider/provider-ref/idempotency columns, no `/api/webhooks/payments/:provider` route, no refund path, no provider SDK, no customer-initiated payment.

**Database: PARTIAL.** `payments` with `invoice_id`, `amount`, `method` (CHECK: bank_transfer/spei/cash/other), `reference`, `paid_at`, `recorded_by`, `note`. `status` and `gateway_ref` were deliberately dropped.

**UI: MISSING everywhere.** No admin payments page, no customer payment history, no "pay this invoice" button.

**Tests:** inside `test/invoices.test.ts`.

**Completion: backend 30% · frontend 0%.**

| Task | Acceptance | Size |
|---|---|---|
| Re-add `payments.status` enum (Pending/Confirmed/Failed) + gateway columns | migration adds `status` with a default, `provider`, `provider_ref`, `provider_event_id` (unique); **verified with `npm run smoke`** — note `1830` dropped `status` on purpose, so this needs an explicit `ALTER`, and `CREATE TABLE IF NOT EXISTS` will be a no-op | **S** |
| Provider-agnostic `PaymentGateway` interface + a no-op dev provider | `createIntent`, `verifyWebhook`, `refund`; nothing in the service layer names a vendor | **M** |
| `POST /api/webhooks/payments/:provider` | mounted **before `express.json()`** so the raw body survives; signature-verified; **idempotent on the provider event id — replaying the same webhook twice changes nothing the second time** | **M** |
| `POST /api/customers/me/invoices/:id/pay` + customer pay flow | returns a redirect/client secret; the customer completes payment in the browser and the invoice reaches `paid` | **M** — **blocked on C1** |
| Admin payments page + customer payment history | admin: list/detail/record-offline/status/refund. Customer: read-only history (§5) | **M** |
| Status cascade | a confirmed payment marks the invoice paid **and extends the subscription**, each transition through the dispatcher, four notifications sent | **M** — depends on 4.10 |

### 4.10 Subscriptions — dep: invoices, payments, packages · **~0%**

**Backend: STUB.** `subscription.service.ts` is `export function createSubscriptionService() { return null; }`. `subscription.router.ts` is `export const subscriptionRouter = {};` and **is not mounted** — `/api/subscriptions` is a 404. `GET /api/admin/subscriptions` returns `{ data: [], message: "not implemented" }` (`admin.router.ts:284`) — `CLAUDE.md:19` explicitly says **do not build UI on it**.

The only real read is `customerService.getMySubscriptions`, which lists rows nothing ever creates. **No code anywhere inserts a subscription.** The renewal cron queries `subscriptions` and will always find zero rows.

**Database: PARTIAL.** `subscriptions` table exists (customer, package, start_date, end_date, status varchar with a default of `active` from `1830`). Missing: `renewal_date`, `auto_renew`, `cancelled_at`, `cancel_at_period_end`, and any audit table.

**UI: MISSING everywhere.** No customer subscriptions page, no admin subscriptions page.

**Tests:** none.

**Completion: backend 10%** (a table and one list query) **· frontend 0%.**

| Task | Acceptance | Size |
|---|---|---|
| Decide the subscription model | **blocked on C4** — nothing below can be specified until plans, periods, renewal mode and cancel semantics are answered | — |
| Create a subscription when an invoice is paid | paying the invoice from an accepted quotation produces exactly one active subscription with correct start/end from `packages.duration_days`; **smoke story 6 stops printing SKIP** | **M** |
| Real `/api/subscriptions` + admin subscriptions endpoints | replace both one-line stubs; list (paginated), detail, status transition on the shared fabric, renew, cancel | **M** |
| `subscription_status_enum` + `renewal_date` + `auto_renew` migration | enum values exactly per §6a; verified against real Postgres | **S** |
| Customer + admin subscription pages | customer sees next renewal and can request renewal/cancellation; admin sees all subscriptions with renewal dates | **M** |

### 4.11 Documents — dep: auth, assignments

**Backend: REAL** — the most mature module after quotations. `document.service.ts` (428 L), `document.router.ts` (232 L). Presigned S3 upload/download with a **working local-disk fallback**, a separate "approved version" upload for staff, a real state machine (`document-status.ts`) that returns 409 with the allowed moves named, a full audit trail in `document_status_history`, an `fromStatus` optimistic-concurrency guard, and a **MIME + extension allow-list** (9 types) on top of the 25 MB cap. Ownership lives in exactly one helper.

**Gaps:** D10 (rejected is terminal — no resubmit), D11 (no history endpoint), D15 (no categories), D16 (agent scoping), and `DELETE /api/documents/:id` (withdraw while pending) is missing. Nothing drives `expiring_soon` / `expired` — see 4.13.

**Database: REAL.** `documents` (+ the four `approved_*` columns, finally migrated in `1820`), `document_status_history` with a real `document_status_enum`. **Documents is the only module with a proper Postgres enum.**

**UI:** customer documents page (`(portal)/dashboard/documents/page.tsx`), staff review queue (`(staff)/documents/page.tsx`).

**Tests:** `test/admin-documents.test.ts` (5), `test/phase1-gate.test.ts` covers staff read access + immediate withdrawal of access. Pass.

**Completion: backend 75% · frontend ~55%.**

| Task | Acceptance | Size |
|---|---|---|
| `document_categories` table + CRUD + `documents.category_id` | **blocked on C5** for the taxonomy values; admin manages the list; the review queue filters by category | **M** |
| `GET /api/documents/:id/history` | returns the existing `document_status_history` rows with the actor's public name; shown on both the customer and staff detail views | **S** |
| Resubmit a rejected document (D10) | `rejected → pending` as a new version, or an explicit `POST /:id/resubmit` creating a linked row; the original file is never overwritten; **smoke story 7 stops printing SKIP** | **M** |
| `DELETE /api/documents/:id` | permitted only while `pending`; removes the stored object; writes a history row | **S** |
| `GET /api/customers/me/required-documents` | the checklist smoke story 7 expects (phase 5.2) | **M** |

### 4.12 Notifications and email — dep: auth · **good bones, no feed**

**Backend: REAL for email, MISSING for in-app.** `notify.service.ts` is a proper dispatcher: writes `notifications_log`, then enqueues a BullMQ `email` job, with a 2 s race-timeout and a `failed` status write if the enqueue fails. **Nothing sends email inline on the request path** — which is exactly what api-surface §8 demands. The worker's `email.processor.ts` compiles Handlebars templates with a dead-letter queue after 3 attempts; all **8 `.hbs` templates exist** in `apps/worker/src/templates/`.

Wired events: `quotation_sent`, `quotation_accepted`, `quotation_rejected`, `document_approved`, `document_rejected`, `invoice_issued`, `payment_recorded`, plus two audit-only types.

**Gaps:** D9 (no read endpoint, no `read_at` column — the "notification centre" in §5 cannot be built), D18 (`WEB_URL` unset → emails contain the bare relative link `/portal/documents`, and `CLAUDE.md:18` records that `/portal/...` is itself the wrong path — the portal routes are `/dashboard/...`). No notification templates table (`GET/POST /admin/notification-templates`), no resend, no broadcast, no per-category opt-out. `POST /api/admin/notifications/email` exists but calls `sendEmail` **directly, inline** — the one place that breaks the dispatcher rule.

**Database: PARTIAL.** `notifications_log` has `user_id, type, channel, status, sent_at` and nothing else.

**UI: MISSING everywhere.** No notification centre, no admin delivery log, no template editor.

**Tests:** `test/notifications.test.ts`, `test/status-notifications.test.ts`, `test/admin-email.test.ts`. Pass — and `queuedEmails` from `test/support/email-queue.fake.ts` makes queue assertions real.

**Completion: backend 60% · frontend 0%.**

| Task | Acceptance | Size |
|---|---|---|
| **Fix `WEB_URL` (D18)** | add to `.env.example` + the production `superRefine`; replace both raw `process.env` reads with `env.webUrl`; change `/portal/` → `/dashboard/` in the templates; a password-reset email contains a clickable absolute URL that loads the reset form | **S** — *cheapest high-impact fix in the audit* |
| `notifications_log.read_at` + title/body migration, and 4 read endpoints | `GET /me/notifications` (paginated), `/unread-count`, `PATCH /:id/read`, `POST /read-all`; verified against real Postgres | **M** |
| Customer notification centre UI | badge count in the header; list with read/unread; marking one read updates the badge without a reload | **M** |
| Route `POST /admin/notifications/email` through the dispatcher | it writes a `notifications_log` row and enqueues, instead of sending inline | **S** |
| Admin notification log + resend | list from `notifications_log` with status; resend re-enqueues one failed job | **M** |
| De-duplicate the SES transport; require `MAIL_FROM` in the worker | one shared module; a production worker with no `MAIL_FROM` **refuses to boot** instead of silently logging every email to stdout | **S** |

### 4.13 Worker and cron — dep: notifications, documents, subscriptions

**Backend: PARTIAL.** `worker.ts` registers exactly **two** things: `runRenewalCron()` and `processEmailJobs()`.

| File | State |
|---|---|
| `queues/email.queue.ts` | **REAL** — 3 attempts, exponential backoff, dead-letter queue |
| `processors/email.processor.ts` | **REAL** — Handlebars, 8 templates, concurrency 5, dead-letter on final failure |
| `crons/renewal.cron.ts` | **REAL but ineffective** — a correct daily 09:00 UTC job with a genuine idempotency guard (`NOT EXISTS … created_at >= CURRENT_DATE`), querying a table **nothing ever populates** (4.10). It will always find zero rows. |
| `crons/expiry.cron.ts` | **STUB** — 5-line TODO, `return true`, **never called** |
| `crons/backup.cron.ts` | **STUB** — 5-line TODO, `return true`, **never called** |
| `processors/document.processor.ts` | **STUB** — `return true` |
| `processors/renewal.processor.ts` | **STUB** — `return true` |
| `queues/document.queue.ts` | **STUB** — `export const documentQueue = {}` |
| `queues/renewal.queue.ts` | **STUB** — `export const renewalQueue = {}` |

So: **document expiry never fires** (nothing moves a document to `expiring_soon` or `expired`, which makes the whole §10 reminder story inert), and **there are no database backups of any kind** — for a platform whose purpose is storing client compliance documents. `S3_BACKUP_BUCKET` is validated in both apps and read by nothing.

The worker also has **no healthcheck** in either compose file and no HTTP listener; it stays alive via `setInterval` (`worker.ts:80`). Its liveness is unobservable.

**Tests:** **none.** `apps/worker/package.json`'s `test` script is just `npm run typecheck`. Typecheck passes (I ran it).

**Completion: backend 35% · frontend n/a.**

| Task | Acceptance | Size |
|---|---|---|
| **Implement + register the document expiry cron** | a document 30 days from `expires_at` produces **exactly one** reminder, not one per tick; `approved → expiring_soon → expired` each write a history row and fire one notification; idempotent across ticks (prove by running it twice) | **M** |
| Quotation expiry sweep | replaces the lazy `expireIfNeeded` on read, so a quotation expires even if nobody opens it | **S** |
| **Implement + register the backup cron** | `pg_dump` lands in `S3_BACKUP_BUCKET` on schedule; **restoring it into an empty Postgres reproduces the dataset and `npm run smoke` passes against the restored DB**; retention policy; a failed backup raises rather than logs | **M** — *highest-severity operational gap* |
| Overdue-invoice sweep | replaces lazy `applyOverdue`; one notification per invoice per transition | **S** |
| Worker healthcheck + a first test | a tiny HTTP or Redis-ping healthcheck in both compose files; at least one test for `sendRenewalReminders`' idempotency guard | **S** |
| Delete or implement the 5 remaining stub files | no file in `apps/worker/src` returns `true` to satisfy the typechecker | **S** |

### 4.14 Admin analytics — dep: everything

**Backend: STUB.** `GET /api/admin/analytics` returns `{ success: true, data: {}, message: "not implemented" }` (`admin.router.ts:289`). `admin.service.ts` is 3 lines: `summary: () => ({})`. `CLAUDE.md:19` says **do not build UI on it**. The four specified endpoints (`/analytics/summary`, `/revenue`, `/documents`, `/quotations`) and `GET /admin/audit-log` do not exist.

`audit-log` is additionally **blocked by D5**: there is no cross-module `status_history` table to read from.

**Database: MISSING** — no aggregate tables, no materialised views, and the per-module audit tables are not unified.

**UI:** `admin-frontend/src/app/(admin)/admin/page.tsx` exists — any numbers on it are either from other endpoints or hardcoded (see §5).

**Tests:** none.

**Completion: backend 2% · frontend ~10%.**

| Task | Acceptance | Size |
|---|---|---|
| `GET /api/admin/analytics/summary` | real counts: customers, active subscriptions, revenue (sum of confirmed payments, MXN), documents by status; single query per block; replaces the `{}` stub | **M** |
| `/analytics/revenue`, `/documents`, `/quotations` | revenue over time by package/service; approval throughput + rejection reasons; calculation→accepted conversion | **M** each |
| Unified `status_history` table (D5) | one table (`entity_type, entity_id, from_status, to_status, changed_by, note, created_at`); `document_status_history` and `quotation_status_history` migrated onto it; the shared transition guard writes to it | **L** — **do this before subscriptions/invoices/payments get their own audit tables, or it becomes five rewrites** |
| `GET /api/admin/audit-log` + admin UI | cross-module trail, filterable by entity type and actor — depends on the row above | **M** |
| Admin dashboard wired to real analytics | every tile on the admin home is API-backed; no hardcoded numbers | **M** |

### 4.15 Public website pages — dep: catalog, pricing

**Backend: PARTIAL.** Six real public endpoints (`/services`, `/packages`, `/worker-ranges`, `/locations`, `/industries`, `POST /quotations/calculate`). **Missing: everything content-related (D14)** — `/faqs`, `/reviews`, `POST /contact`, `GET /settings`, `/packages/:id`, `/locations/states`, `/locations/cities`, `POST /quotations/request`. No `faqs`, `reviews` or `contact_submissions` table.

**UI:** home, about, services, packages, contact, faq pages all exist in `customer-portal/src/app/`. Home/services/packages are **live-data (ISR, `revalidate: 60`)**; about/contact/faq are **static with hardcoded copy**. The contact page has **no form at all** — its only action is a `<Link>` to `/register`, and its contact details are placeholders: `hello@constdoc.example` and `+92 300 0000000` (a **Pakistani** country code on an MXN-currency Mexican product). **No reviews section.** No `sitemap.ts`, no `robots.ts`, zero JSON-LD.

⚠️ `src/lib/public-api.ts:18-25` swallows **all** fetch and HTTP errors and returns `[]`, so an API outage is indistinguishable from an empty catalogue and silently renders "Services are being configured. Check back shortly." (`catalog-sections.tsx:39-43`).

**Completion: backend 40% · frontend ~65%** of the pages that exist, but 0% of the three content modules.

| Task | Acceptance | Size |
|---|---|---|
| `faqs` + `reviews` + `contact_submissions` tables, public read + admin moderation | FAQs grouped by category; only approved reviews are public; the contact form is IP-rate-limited, spam-guarded and notifies admin; all three manageable from the admin UI | **L** (split → 3 × **M**) |
| `GET /api/public/settings` | business name, address, hours, social links from `app_settings`, so the footer is editable without a deploy | **S** |
| SEO baseline | per-route metadata (commit `2dac612` made a start), `sitemap.xml`, `robots.txt`, Open Graph tags, JSON-LD for the business; every public page passes Lighthouse mobile | **M** |

### 4.16 Deployment (Docker, Nginx, CI, AWS SES and S3) — dep: all

**Docker: REAL for the backend, MISSING for the frontends.** Five services in `compose.yml` / `compose.prod.yml` (nginx, api, worker, postgres, redis), multi-stage Dockerfiles on `node:20-alpine`, `tini` entrypoint, non-root `USER node` in production, healthchecks on api/postgres/redis, Postgres and Redis localhost-bound in dev and unpublished in prod. The worker image correctly copies the 8 `.hbs` templates.

Problems:
1. **Neither Next.js app is containerised** — no Dockerfile, no `.dockerignore`, no `output: "standalone"`, no compose service. The only way to serve them today is `npm run dev` on a laptop.
2. **`compose.prod.yml:27-28` publishes the API on `0.0.0.0:3001`**, contradicting the file's own header comment and bypassing nginx's rate limiting and 26 MB body cap — plaintext HTTP on a public port.
3. **`npm install`, not `npm ci`, in all four Docker stages** — yet `package-lock.json` exists and is in sync in all four packages, and CI already uses `npm ci`. **The image can contain a different dependency tree than the one CI tested.**
4. No healthcheck on `worker` or `nginx`; no `restart:` policy in `compose.yml`; no resource limits; no network segmentation.
5. `cp .env.example .env` does **not** produce a working stack: `JWT_SECRET`/`JWT_REFRESH_SECRET`/`DB_USER`/`DB_PASS` ship empty (fail-fast by design), and `.env.example:13` sets `NODE_ENV=production`, which makes all host tooling (`db:migrate`, `db:seed`, `smoke`) run under the production validation branch against a placeholder `DATABASE_URL`.

**Nginx: PARTIAL.** One `server` block, `listen 80`, `server_name localhost`. `/api/` proxies to `api:3001` with correct `X-Forwarded-*` (paired with `app.set("trust proxy", 1)`), `client_max_body_size 26m`, rate limit `100r/m burst=20`. `/health` deliberately unlimited.

- **`location /` returns a hardcoded placeholder string.** The frontends are **not proxied at all** — no upstream, no `location /_next`, no static root.
- **TLS is a commented-out placeholder** (`nginx.conf:58-72`, `example.com` paths). `compose.prod.yml:15` publishes **443 with nothing listening on it** → connection refused. `ssl_certs` is an empty named volume with no certbot, no ACME webroot, no renewal.
- No `gzip`, no `server_tokens off`, no security headers outside the commented block, no access/error log config.

**CI: PARTIAL.** `constDocManagment/.github/workflows/ci.yml` is **real, not a placeholder** — on push to `main` and all PRs it runs `npm ci`, `typecheck`, `typecheck:test`, `test`, `build` for `apps/api`. But: **no worker job** (never typechecked or built in CI), no lint, no Docker build, **no `npm run smoke`** — so the drift class `CLAUDE.md` calls the top risk reaches production undetected. **Both frontends have no CI at all** (their `.github/` holds only an instructions markdown file), and they are on divergent majors — `customer-portal` on `next@16.3.5`/`react@19.2.8`, `admin-frontend` on `next@15.5.7`/`react@19.1.0`, with nothing enforcing either.

**Nothing deploys anywhere.** `deploy.yml` was added in `0c8cdac` and **deleted** in `5e9e58d`, replaced by nothing. No registry push, no image tags (so no artifact to roll back to), no environment, no OIDC.

**S3: REAL.** `utils/s3.ts` (135 L) does genuine presigned PUT/GET (`expiresIn: 900`) gated on `isS3Configured()` = `AWS_REGION && S3_BUCKET`; both presigners return `null` rather than throwing, and **every caller handles the null** with a local-disk fallback under `storage/`, mounted as the `api_storage` volume and pre-chowned in the Dockerfile. Catalog images are served back through `GET /api/public/catalog/images/*`.
Two real bugs: the IAM policy scopes to `documents/*` but catalog keys are written as `items/<uuid>/…` → **AccessDenied on every catalog image upload when S3 is configured**; and `s3:DeleteObject` is absent while `removeCatalogObject` silently no-ops → **S3 catalog objects leak forever**. Also `getLocalDocumentPath` double-prefixes, so local files land at `storage/documents/documents/<uuid>`.

**SES: REAL.** Direct `@aws-sdk/client-ses` `SendEmailCommand` (never SMTP; `nodemailer` is installed in both apps and **never imported**). Transport chosen by **configuration, not `NODE_ENV`**: `ses` when `AWS_REGION && MAIL_FROM`, otherwise a loud `log` transport that warns and returns `{ delivered: false }`. `sendEmail` never throws, so forgot-password cannot leak address existence through a 500. `MAIL_FROM` is required in production **for the API only** — the worker, which sends every status-change email, has no such guard and will boot happily in production dropping every email to `console.warn`.

**Env config:** `WEB_URL` is validated in `env.ts` but absent from `.env.example` **and** from `.env`, and is read twice as raw `process.env` (D18). `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are set in the real `.env` and validated nowhere, while `.env.example:55` claims credentials come from an IAM instance role. `MAIL_FROM` is declared twice. `S3_BACKUP_BUCKET` is dead config. **`CORS_ORIGIN` is optional and falls back to `origin: true` with `credentials: true`** — the production guard only fires under `NODE_ENV=production`, and `NODE_ENV` defaults to `development`, so **forgetting it silently disables the CORS guard, the JWT-secret-reuse guard and the `MAIL_FROM` guard at once.** That is the most dangerous default in the config.

**Migrations run automatically** inside `initializeDatabase()` before `app.listen` — convenient, but with **no advisory lock** (two replicas race), no way to migrate without starting the API, no pre-migration backup, and a crash-loop rather than a revert on failure.

**Operationally missing:** TLS, backups, log aggregation (console passthrough + bare `console.*` in the worker; zero `pino`/`winston`), error monitoring (zero `sentry`/`otel` hits), metrics (`GET /api/metrics` specified, not implemented; no queue-depth export), secret management (plaintext `.env` on the host), rollback, and any frontend hosting. Redis has **no password** and `maxmemory 256mb` with `noeviction`, so BullMQ writes **hard-fail** at the ceiling with nothing watching that threshold.

**Completion: ~45% dev-ready, ~10% production-ready.**

Full task list in §7 (D1–D16 there are the deployment tasks, dependency-ordered).

---

## 5. `customer-portal` — public site + customer portal

Next.js **16.3.5** / React 19.2.8, App Router only. No `middleware.ts`, no `src/app/api/**`. **Checks all green:** `npx tsc --noEmit` 0 errors · `npm run lint` 0 errors/0 warnings · `npx vitest run` **2 files, 4 tests, 4 passed** · `npm run build` 0 errors, 15/15 pages.

### Routes

| URL | File | Verdict |
|---|---|---|
| `/` | `src/app/page.tsx` | **REAL** — ISR `revalidate: 60`, `getPublicServices()` + `getPublicPackages()`. Hero copy static. No own `metadata`. |
| `/services` | `src/app/services/page.tsx` | **REAL** — live services + `<PricingCalculator/>` |
| `/packages` | `src/app/packages/page.tsx` | **REAL** — live packages. No detail route, **no purchase CTA** |
| `/about` | `src/app/about/page.tsx` | **PARTIAL** — 35 lines, zero API calls, all copy hardcoded |
| `/contact` | `src/app/contact/page.tsx` | **PARTIAL** — **no form, no POST**; placeholder email `hello@constdoc.example`, placeholder phone `+92 300 0000000` |
| `/faq` | `src/app/faq/page.tsx` | **PARTIAL** — hardcoded 4-item `questions` array; one answer advertises renewal reminders as "planned" |
| `/login`, `/register` | `src/app/login|register/page.tsx` | **REAL** — zod-validated, wired to `/auth/login` and `/auth/register` |
| `(portal)` layout | `src/app/(portal)/layout.tsx` | REAL guard — redirects to `/login`, bounces non-customers. Only **4** nav links. ⚠️ both redirects fire **during render**, not in an effect |
| `/dashboard` | `(portal)/dashboard/page.tsx` | **REAL** — `GET /customers/me/dashboard`. No loading state. Renders raw `String(invoice.status)`, bypassing the `StatusBadge` that already supports invoice statuses |
| `/dashboard/documents` | `(portal)/dashboard/documents/page.tsx` | **REAL** — the strongest page. Presign→PUT with multipart fallback, both download versions, client-side type/size validation. No delete/replace/filter/pagination; **`expiresAt` is typed and never rendered** |
| `/dashboard/quotations` | `(portal)/dashboard/quotations/page.tsx` | **REAL** — list + accept/reject. ⚠️ rejection reason is **hardcoded** `{ reason: "Customer declined" }`; no mutation pending/error UI |
| `/dashboard/quotations/[id]` | `…/[id]/page.tsx` | **REAL** — detail + PDF download. **No accept/reject on the detail page** |
| `/dashboard/billing` | `(portal)/dashboard/billing/page.tsx` | **PARTIAL** — fetches real subs + invoices but renders a **raw `packageId` UUID as the subscription name**, `id.slice(0,8)` as the invoice label, and raw `String(amount)` bypassing `formatMoney` so **MXN never renders**. No pay button, no detail, no renew, no cancel, no loading/empty/error state |

**Absent entirely** (no route, not even a stub): `/forgot-password`, `/reset-password`, `/dashboard/profile`, `/dashboard/invoices/[id]`, `/dashboard/subscriptions`, `/dashboard/notifications`, `/dashboard/documents/[id]`, `/packages/[id]`, `/reviews`, `sitemap.ts`, `robots.ts`, `middleware.ts`.

### API transport

`src/lib/api.ts` (`apiRequest`, `downloadRequest`) + `src/lib/public-api.ts` (SSR/ISR). **`Authorization: Bearer` header only** — no cookies, `credentials` never passed. **23 distinct backend endpoints consumed.** 401 triggers one de-duplicated refresh-and-retry.

⚠️ **The session — including the refresh token — is stored in `sessionStorage`** under `constdoc.customer.session` (`auth-context.tsx:12,26`). XSS-readable. Same pattern in `admin-frontend`.

**Dead code:** 5 unused exports in `public-api.ts`; 16 of 17 shadcn components have zero importers (only `badge`); `sonner` installed but `<Toaster/>` never mounted; `react-hook-form`, `@hookform/resolvers`, `next-themes` installed with **zero imports**; the 5 `create-next-app` template SVGs are still in `public/`.

### Completion (agent's weighted model, weights summing to 100 → **54.65**)

**≈ 55% overall.** Adjusted for the ~15 points that are blocked by missing backend routers (pay-invoice 8, subscription management ~5, notifications 4), the achievable ceiling against today's API is ~83 points → **~66% of what is currently buildable**.

**Tests: 4 cases across 2 files** — `apiRequest` envelope parse/unwrap and 2 login-form cases. Untested: **every page except `/login`**, the calculator, upload/download, accept/reject, `AuthProvider` restore and the 401 refresh-retry, `formatMoney`, `StatusBadge`, `public-api.ts` error swallowing. Roughly 2 of ~16 meaningful units.

---

## 6. `admin-frontend` — admin + staff portal

Next.js **15.5.7** / React 19.1.0 — **a major behind `customer-portal`, with nothing enforcing either**. **960 lines of hand-written source across 24 files** (excluding shadcn primitives). No `middleware.ts`. Every route is `○ (Static)`; all data is client-fetched. **Checks all green:** `npx tsc --noEmit` 0 errors · `npm run lint` 0/0 · `npx vitest run` **4 files, 10 tests, 10 passed** · `npm run build` 0 errors, 17/17 pages.

### Routes

| URL | File | Role | Verdict |
|---|---|---|---|
| `/` | `src/app/page.tsx` | any | INFRA — `redirect("/staff/login")` |
| `/login` | `(auth)/login/page.tsx` | any | INFRA — ⚠️ `"use client"` component calling the server `redirect` |
| `/staff/login` | `(auth)/staff/login/page.tsx` | agent, manager | **REAL** — role-gated to `["agent","manager"]` |
| `/admin/login` | `(auth)/admin/login/page.tsx` | admin | **REAL** — role-gated to `["admin"]` |
| `/admin` | `(admin)/admin/page.tsx` | admin | **PARTIAL** — 40 lines, **zero API calls**, two static cards; one is non-interactive prose |
| `/admin/users` | `(admin)/admin/users/page.tsx` | admin | **REAL** — 344 lines; the only genuinely finished screen. List + search/role/status filters + pagination + create (incl. agent/manager) + enable/disable |
| `/admin/quotations` | `(admin)/admin/quotations/page.tsx` | admin | **PARTIAL** — list + **2** hardcoded transition buttons (`draft→sent`, `under_review→accepted`). No reject/cancel/expire, no `note` field (the backend accepts one), no detail, no history, no invoice conversion, no filters, no pagination, no loading/empty state |
| `/staff` | `src/app/staff/page.tsx` | agent, manager | **PARTIAL** — static link cards, zero API calls. ⚠️ **outside the `(staff)` route group**, so it imports `StaffLayout` and wraps itself manually |
| `/documents` | `(staff)/documents/page.tsx` | agent, manager | **REAL** — live queue + start-review/approve/reject + error + empty states |
| `/customers` | `(staff)/customers/page.tsx` | agent, manager | **STUB** — 11 lines: *"Customer assignment views will be added with the staff assignment API."* |
| `/oversight` | `(staff)/oversight/page.tsx` | manager | **STUB** — 11 lines: *"Team workload and review oversight will be connected when the manager API is available."* ⚠️ **the route itself has no role check** — only the nav link is manager-gated |
| `/quotations` | `(staff)/quotations/page.tsx` | agent, manager | **PARTIAL** — list + 2 transitions (`draft→sent`, `sent→under_review`). No accept/reject, no detail, no history |
| `/403`, `/_not-found` | — | any | INFRA — ⚠️ the 404 CTA is hardcoded to `/admin`, so an agent hitting a bad URL is sent somewhere their role is bounced out of |

**There are zero dynamic (`[id]`) routes in this repo. No detail page exists for any entity.**

### API transport and guards

`src/lib/api.ts` (103 lines) — single `apiRequest` wrapper, `Authorization: Bearer`, no cookies. Session (**including the refresh token**) in `sessionStorage` under `constdoc.session`. Single-flight 401 refresh with a one-retry guard, and it is tested.

**12 distinct endpoints consumed out of ~60 live backend endpoints — about 20%.**

Guards are **client-side only**; there is no `middleware.ts`, and because every page is statically prerendered the protected shell HTML is served to unauthenticated visitors (only the data needs a token). `CLAUDE.md` in that repo acknowledges the guards are UX-only and the API is the real enforcement — so this is a risk note, not a violation. Two real defects: `router.replace()` is called **during render** in five places across both layouts, and `/oversight` is unguarded at the route level.

### Module coverage — the headline

**Admin modules with any UI: 3 of 29 rows. Staff modules with any UI: 3 of 29 rows.**

Entirely missing admin surfaces, each with a **working, unused backend**: services CRUD (4 endpoints idle), industries CRUD (4), locations CRUD (4), worker ranges CRUD (4), packages CRUD (5), settings editor (2), invoices (4), admin document override (2), manual email (1), user detail/edit (2), quotation detail/history/create/PDF (4), all of `/admin/catalog/*` (20). Missing **and** backend-blocked: customers, assignments, payments, subscriptions, analytics, audit log, notification log/templates, document categories, FAQs, reviews, contact submissions.

### Completion

| Surface | Figure | Basis |
|---|---|---|
| **ADMIN** | **~10%** | weighted `3.55 / 34`. 2 of 15 modules have any UI; 13 have no route file |
| **STAFF (agent/manager)** | **~41%** | weighted `6.95 / 17`. Login done, document queue works end-to-end, but 2 of 4 pages are 11-line placeholders |
| **Repo overall** | **~25%** | `13.90 / 55` including shared infrastructure at 0.85 |

The route-count figure of 60% (4 REAL + 4 PARTIAL + 2 STUB of 10) **should not be quoted** — it measures only the routes that exist, and 13 of 15 requested modules have no route file at all.

**The key structural finding:** this is not an evenly 25%-finished app. The plumbing — auth, API client with refresh, guarded layouts, error boundaries, design tokens, test harness, clean typecheck/lint/test/build — is **~85% done**, and the feature surface is **~12% done**. Almost every remaining task is "add a page that calls an endpoint that already works", which is why the backlog is mostly S/M rather than L.

### Two real bugs found (not just gaps)

1. **The "last admin" protection does not work.** `(admin)/admin/users/page.tsx:259-264` gates on `query.data.total === 1`, but `total` is the **filtered** result count. With any search or role filter applied the guard silently vanishes; with no filter it is the total *user* count, not the admin count. **The Disable button is enabled for the sole admin on any realistic dataset** — an admin can lock the entire organisation out of the admin portal.
2. `src/app/loading.tsx:5` uses `border-t-amber-700`, the one violation of that repo's own `CLAUDE.md` rule ("Never hex or palette classes in pages").

**Tests: 10 cases across 4 files.** Untested: `/admin/users` (the 344-line largest page — zero coverage), both quotation pages, the admin layout guard, `AuthProvider` persistence, `formatMoney`/`formatDate`, `StatusBadge`, document reject/start-review. And **2 of the 4 test files assert only that stub headings render** — they pass *because* the pages are placeholders and will need rewriting when the pages are built.

---

## 7. Dependency graph

```
                         ┌──────────────────┐
                         │  auth & users    │  90% / 45%   ← independent
                         └────────┬─────────┘
            ┌─────────────────────┼──────────────────────┬────────────────────┐
            ▼                     ▼                      ▼                    ▼
   ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐  ┌────────────────┐
   │   customers    │   │     catalog      │   │  notifications   │  │   documents    │
   │   70% / 40%    │   │   90% /  0%      │   │   60% /  0%      │  │  75% / 55%     │
   └───────┬────────┘   └────┬────────┬────┘   └────────┬─────────┘  └───────┬────────┘
           │                 ▼        ▼                 │                    │
           │        ┌────────────┐ ┌──────────┐         │                    │
           │        │  packages  │ │ pricing  │         │                    │
           │        │  65% / 30% │ │ 90% / 30%│         │                    │
           │        └──────┬─────┘ └────┬─────┘         │                    │
           │               │            │               │                    │
           │               └─────┬──────┘               │                    │
           │                     ▼                       │                    │
           │           ┌──────────────────┐              │                    │
           └──────────▶│   quotations     │◀─────────────┘                    │
                       │   85% / 55%      │                                   │
                       └────────┬─────────┘                                   │
                                ▼                                             │
                       ┌──────────────────┐                                   │
                       │    invoices      │  70% / 30%                        │
                       └────────┬─────────┘                                   │
                                ▼                                             │
                       ┌──────────────────┐                                   │
                       │    payments      │  30% /  0%   ◀── BLOCKED on C1    │
                       └────────┬─────────┘                                   │
                                ▼                                             │
                       ┌──────────────────┐                                   │
                       │  subscriptions   │  10% /  0%   ◀── BLOCKED on C4    │
                       └────────┬─────────┘                                   │
                                │                                             │
       ┌────────────────────────┴──────────────┬──────────────────────────────┘
       ▼                                       ▼
┌──────────────────┐                  ┌──────────────────┐
│ worker & cron    │  35% / n/a       │  ASSIGNMENTS     │   0% / 0%  ◀── BLOCKED on C6
│ (expiry/renewal/ │                  │  (agent↔customer)│   gates the whole
│  backup)         │                  └────────┬─────────┘   agent/manager portal
└──────────────────┘                           │             AND is a live data leak
       │                                       │
       └───────────────┬───────────────────────┘
                       ▼
            ┌──────────────────────┐
            │ unified status_history│  ← D5. Build BEFORE subs/invoices/payments
            └──────────┬───────────┘    get their own audit tables, or it is 5 rewrites
                       ▼
            ┌──────────────────────┐
            │  admin analytics     │  2% / 10%   (audit log needs the row above)
            └──────────────────────┘

INDEPENDENT (no module dependency, only deployment):
  • public content: faqs / reviews / contact_submissions   40% / 65%-of-pages
  • deployment: Docker · nginx · CI · TLS · backups        45% dev / 10% prod
```

### Dependency type per module

| Module | Type | Depends on |
|---|---|---|
| auth & users | **independent** | — |
| customers | depends | auth |
| **assignments** | depends | auth, customers — **and gates** documents-scoping, agent quotations, manager oversight, the two staff stub pages |
| catalog | depends | auth |
| packages | depends | catalog |
| pricing & settings | depends | catalog |
| quotations | depends | pricing, catalog, notifications |
| invoices | depends | quotations |
| payments | depends | invoices · **client-blocked (C1)** |
| subscriptions | depends | invoices, payments, packages · **client-blocked (C4)** |
| documents | depends | auth · **scoping blocked on assignments**; categories blocked on C5 |
| notifications & email | depends | auth — **and is depended on by** quotations, invoices, payments, documents, cron |
| worker & cron | depends | notifications, documents, subscriptions |
| admin analytics | depends | **everything** + the unified `status_history` |
| public website | **independent** | catalog, pricing for the live bits; content tables are standalone |
| deployment | depends | all (but the Docker/nginx/CI/backup work is independently shippable **now**) |

### Critical-path reading

1. **`notifications` is load-bearing in both directions** and is the cheapest thing to repair — the one-line `WEB_URL` fix makes every existing email usable.
2. **`assignments` is the highest-leverage blocked item.** It is simultaneously (a) a live data-exposure gap, (b) the gate on both `admin-frontend` stub pages, and (c) one service helper's worth of code once the table exists.
3. **`payments` → `subscriptions` is the longest blocked chain**, and both ends need a client answer. Build the seam now so a late answer costs a day.
4. **The unified `status_history` decision must be made now even if the table is built later** — every new audit table built per-module multiplies the eventual rewrite.

---

## 8. What fits in 60% of scope — the coherent slice

**Where you are: ≈43% of total scope delivered.** My arithmetic — backend ~54% (weighted over 16 modules), frontend ~34% (public+portal ~55% × 0.4, admin ~10% × 0.4, staff ~41% × 0.2); overall at a 45/55 backend/frontend scope split → `0.45 × 54 + 0.55 × 34 ≈ 43%`. Treat ±8 points as the error bar until `npm run smoke` runs.

**So the 60% slice means finding the ~17 points that buy the most product.** The chosen story:

> **A visitor prices a real job → saves it as a quotation → an admin configures every price from the browser → a reviewer opens, reads and approves the actual document → an invoice is raised and a payment recorded → the customer is emailed a working link at every step.**

That is demoable end to end, it closes the live security gap, and it needs no client answer except the pricing numbers (C3).

### In scope — ordered by value, respecting dependencies

**Wave 1 — cheap fixes that unblock everything else (~2 days)**

| # | Task | Why first | Size |
|---|---|---|---|
| 1 | **`WEB_URL` fix + `/portal/` → `/dashboard/` in templates** | every email the system already sends currently contains a broken relative link. Cheapest high-impact fix in the audit | **S** |
| 2 | **Paginate quotation + document + agent lists** (D8) | api-surface §8 warns retrofitting after the tables are built is "a rewrite of every table component" — and you are about to build ~12 tables | **S** |
| 3 | **Fix the last-admin guard** (`admin/users/page.tsx:259-264`) | an admin can currently lock the whole org out of the admin portal | **S** |
| 4 | **Service multi-select + full breakdown in the calculator** | the lead-gen surface is quoting the wrong price today | **M** |
| 5 | **`npm run smoke` against a live stack; re-baseline every number here** | nothing below should be trusted until this runs | **S** |

**Wave 2 — close the live security gap and unstub the staff portal (~3 days)**

| # | Task | Why | Size |
|---|---|---|---|
| 6 | `agent_customer_assignments` table + entity + migration | **blocked on C6 for the rules; build the table on the recommended default** (one customer → many agents, agent sees assigned only, manager assigns) and make it configurable later | **S** |
| 7 | `/api/manager` router: `GET/POST /assignments`, `DELETE /assignments/:id`, `GET /team` | manager-only boundary, which §8 requires and which does not exist | **M** |
| 8 | **Narrow `assertCanReadDocument` to assigned customers** | closes D16. Test both halves: 403 on direct fetch, omitted from lists | **M** |
| 9 | Manager assignment UI + agent "my customers" page | replaces both 11-line stub pages; the Phase-7 gate ("assign a customer and watch that agent's queue populate") | **M** |

**Wave 3 — make the reviewer's job possible (~2 days)**

| # | Task | Why | Size |
|---|---|---|---|
| 10 | **Open the file from the staff review queue** | a reviewer currently **cannot open the document they are approving**. The single most indefensible gap in a document-compliance product | **S** |
| 11 | Resolve customer names in the queue (stop showing raw UUIDs) | the queue is unusable for a human today | **S** |
| 12 | Require a rejection reason on document reject | §6.2 q6; the dialog + textarea components are already installed and unused | **S** |
| 13 | `GET /api/documents/:id/history` + show it on both detail views | the data is already fully populated; only the endpoint is missing | **S** |
| 14 | Document detail page `/documents/[id]` (staff) + `/dashboard/documents/[id]` (customer) | first dynamic routes in `admin-frontend` | **M** |

**Wave 4 — "no pricing logic hardcoded" becomes demonstrable (~4 days)**

| # | Task | Why | Size |
|---|---|---|---|
| 15 | **Admin CRUD pages: services, industries, worker ranges, locations** | 16 working endpoints are unreachable from a browser. This is the Phase-7 gate and what lets the client enter their own numbers (**C3**) | **L** → split 4 × **M** |
| 16 | Admin settings editor (`quote_validity_days`, `currency`, `payment_terms_days`) | 2 working endpoints idle | **S** |
| 17 | Admin packages page + `packages.is_active` migration | retired packages are currently public | **M** |
| 18 | "Save this estimate" → `POST /customers/me/quotations` | closes calculator→quotation; the endpoint exists and is never called | **M** |

**Wave 5 — the money story, visible without a DB client (~3 days)**

| # | Task | Why | Size |
|---|---|---|---|
| 19 | Quotation detail + history + the **full** transition set with `note` | 2 of ~6 transitions are wired; the backend already accepts a note | **M** |
| 20 | Admin invoices list + detail + raise-from-quotation + cancel | 4 working endpoints idle; `StatusBadge` already carries invoice statuses for pages that don't exist | **M** |
| 21 | Record an offline payment from the invoice detail page | `POST /admin/invoices/:id/payments` is real and well built | **S** |
| 22 | Invoice PDF + `GET /me/invoices/:id/pdf`; fix billing-page formatting | MXN currently never renders on the billing page | **S** |
| 23 | **Re-add `payments.status` enum + gateway columns + `PaymentGateway` interface** | D2/D3. **Build the seam only** — you confirmed the gateway is in scope but it is blocked on **C1**, so this makes a late provider choice cost a day instead of a week | **M** |

**Wave 6 — automation and a URL you can demo on (~3 days)**

| # | Task | Why | Size |
|---|---|---|---|
| 24 | **Implement + register the document expiry cron** | nothing currently moves a document to `expiring_soon`/`expired`, so the whole §10 reminder story is inert. Must be idempotent across ticks — prove it by running twice | **M** |
| 25 | **Implement + register the backup cron; test a restore** | there are **no backups of any kind** for a platform that stores client compliance documents. Highest-severity operational gap | **M** |
| 26 | Containerise both frontends + proxy them in nginx (replace the `/` placeholder) | today the only way to serve them is `npm run dev` on a laptop | **M** |
| 27 | `npm ci` in all four Docker stages; worker + both frontend CI jobs; `npm run smoke` in CI | the image can contain a different dependency tree than CI tested, and the drift class `CLAUDE.md` calls the top risk reaches production undetected | **S** |
| 28 | Forgot/reset-password pages in both frontends | the endpoints exist; users currently cannot recover an account | **M** |
| 29 | Contact form + `POST /api/public/contact` | the contact page currently shows a placeholder email and a **Pakistani phone number** on a Mexican product | **M** |

That is **29 tasks ≈ 17 working days for one developer**, which lands at roughly **60–63% of scope**.

### Explicitly deferred — and why

| Deferred | Reason | What to do instead now |
|---|---|---|
| Payment gateway integration, webhook, customer pay flow | **blocked on C1** (provider + credentials) | ship task 23 (the seam) so a late answer costs a day |
| Subscriptions beyond "created when an invoice is paid" | **blocked on C4** (plans, periods, renewal mode, cancel semantics) — nothing can be specified | nothing; do not guess the model |
| Analytics dashboards (summary/revenue/documents/quotations) | large, and every tile needs a module that is itself incomplete | keep the `{}` stub; **do not build UI on it** (`CLAUDE.md:19`) |
| Audit-log viewer | needs the unified `status_history` first | **decide D5 now** and write it down, even if the table lands next sprint |
| In-app notification centre | needs a `notifications_log` migration (`read_at`, title, body) plus 4 endpoints plus UI | the email path already works; the feed is additive |
| Document categories | **blocked on C5** (the taxonomy itself) | nothing |
| FAQs + reviews as database content | **blocked on C9** (the client owns the content) | leave the hardcoded FAQ array; ship only the contact form |
| Cookie-based auth (D1) | **blocked on C10**, and it touches every page in both frontends | get the bearer-token deviation accepted **in writing** |
| The `catalog` module | unscoped (your decision) | freeze it; do not extend it |
| Resubmit a rejected document | real gap (D10) but needs a version model | note it as a known limitation for UAT |
| 13 remaining admin modules | out of 60% by definition | the backlog in §4 is already single-PR sized |

### Honest risk statement

Three things make this slice tighter than it looks:

1. **The 8-week cap from the plan's own 2026-09-03 baseline expires around 2026-10-29** — about two weeks out. 17 working days of the above is *more* than two weeks for one developer. Cut from the bottom of Wave 6 upward, not from the top.
2. **Every number here is unverified against a real database.** Docker was down, so `npm run smoke` — which `CLAUDE.md` calls the authoritative gate and which has already caught four bugs a green 120-test suite could not see — did not run. Run it before committing to any of this.
3. **C1 and C3 are the real schedule.** Without the payment provider you cannot close the money loop; without the client's pricing numbers the calculator is a demo of invented prices. Both are requests, not development tasks — send them today, in writing.

---

## 9. Verification plan

Run in this order. Steps 1–4 are the gate for trusting anything in this document.

```bash
# 1. Bring the stack up (Docker Desktop must be running — it was not during this audit)
cd E:\ConstructionWebsite\constDocManagment
docker compose up -d --build
docker compose ps                        # all five services healthy
curl http://localhost:3001/health
curl http://localhost:3001/health/ready  # expect 200 with database:true, redis:true

# 2. Migrate and seed against real Postgres
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed  # or db:reset first for a clean Mexican-only dataset

# 3. THE REAL GATE — and the delivery scoreboard
cd apps\api
npm run smoke
#   Count the SKIP lines. Expect at least: story 4 (package pricing, phase 1.4),
#   story 6 (payment activates subscription, phase 4.1), story 7 resubmit (5.1),
#   story 7 required-documents (5.2). Any OTHER failure is a live bug this
#   static audit could not see — the fake-DB blind spot has produced four already.

# 4. Static checks (all four passed during this audit)
cd apps\api   && npm run typecheck && npm run typecheck:test && npm test
cd apps\worker && npx tsc --noEmit -p .
cd ..\..\..\customer-portal && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
cd ..\admin-frontend        && npx tsc --noEmit --incremental false && npm run lint && npx vitest run && npm run build
```

**Per-task verification rules, carried from `CLAUDE.md`:**

- **Any persistence change is verified with `npm run smoke`, never with `npm test` alone.** The Jest suite runs against an in-memory fake and cannot see a column on an entity with no migration, a column in Postgres on no entity, or a relation whose `@OneToMany` lacks `cascade`.
- After changing any decorator (relation, cascade, column), `docker compose restart api` — `ts-node-dev --respawn` does **not** rebuild entity metadata, so the change silently does nothing.
- `CREATE TABLE IF NOT EXISTS` in a later migration is a **no-op** on an already-migrated database. Use explicit `ALTER`. This matters immediately for task 23: migration `1830` deliberately dropped `payments.status`, so re-adding it needs an `ALTER`, not a table re-create.
- New infra modules need a fake in `apps/api/jest.config.js` `moduleNameMapper`, or Jest will not exit.
- Assert queued emails with `queuedEmails` from `test/support/email-queue.fake.ts`.
- Every architecture, security, database or deployment decision gets an appended entry in `docs/decision-log.md` (AGENT.md rule 7).

**End-to-end demo script for the 60% slice** — this is the acceptance test for the whole plan:

1. As a visitor, open `/services`, pick **several** services, a state, a city, an industry and a worker count; the breakdown shows worker base, each service, city fee and total **in MXN**.
2. Register, then click "Save this estimate" — a `Draft` quotation appears at `/dashboard/quotations/:id` with correct line items **in Postgres** (`SELECT * FROM quotation_items` must not be empty).
3. As admin, change a location multiplier at `/admin/catalog/locations`; re-price the same configuration; the number changes **with no deploy**.
4. As admin, move the quotation `draft → sent`; the customer receives an email whose link **opens the quotation** (not a bare `/portal/...` path).
5. As customer, accept it. As admin, raise the invoice, then record a SPEI payment; the invoice reaches `paid`.
6. As admin, assign that customer to `agent2@test.com`. Sign in as `agent@test.com` — the customer and their documents are **absent**, and a direct fetch by document id returns **403, not 404 and not an empty list**.
7. As `agent2`, open the review queue, **click through to the actual file**, reject it **with a reason**, then approve it. The customer sees the status change, the rejection reason, and the full history.
8. Run the expiry cron twice; a document 30 days from expiry produces **exactly one** reminder.
9. Run the backup cron; restore the dump into an empty Postgres; `npm run smoke` passes against the restored database.
