# Delivery Plan — Construction & Compliance Service Management Platform

Derived from the MJPRODS Project Requirements & Scope Document v1.0 (Final).
Companion document: `docs/api-surface.md` for the endpoint-level specification.

Baseline date: 2026-09-03. Timeline: 8 weeks hard cap, 6–7 week build target.

---

## 1. Where the project actually stands today

Before phasing anything, this is the verified state of the codebase, not an estimate.

**Working and complete:**

- Docker stack (`api`, `worker`, `postgres`, `redis`, `nginx`) with fail-fast env validation, healthchecks, graceful shutdown, and idempotent migrations.
- Authentication: register, login, refresh with rotation, logout, reset-password. Refresh tokens SHA-256 hashed, stored in Postgres with a Redis mirror.
- Document workflow end to end: presigned S3 upload with local-disk fallback, download, status transitions guarded by a real state machine, full audit trail in `document_status_history`.
- The pricing engine. `apps/api/src/modules/pricing/pricing.engine.ts` implements `workerBasePrice × locationMultiplier + serviceTotal + cityFee` and is correct — but **no HTTP route calls it**, so the calculator is unreachable.
- 16 tables, 18 foreign keys, 2 Postgres enums.

**Declared but empty:** `/api/quotations`, `/api/pricing`, `/api/packages` and all 8 `/api/admin` routes return hardcoded `[]`, `{}` or `total: 0`. `payments` and `subscriptions` routers are `export const x = {}` and are not mounted, so `/api/subscriptions`, `/api/payments` and `/api/invoices` return 404. All 9 worker queue/processor/cron files are stubs. `notifications_log` has no write path anywhere in the codebase.

**Not started:** the entire frontend. There are zero `.tsx` files in the repository and no `next.config.*`. The public website and all three portals are greenfield.

Honest reading: the backend is roughly 40% built, the frontend is 0%, and the 8-week cap is tight but reachable **only** if the status-and-notification fabric from scope §6a is built once as shared infrastructure rather than five times per module. That single choice is the difference between a comfortable delivery and a missed deadline.

---

## 2. Gap between the signed scope and the current schema

Every row here is work the scope document requires and the database cannot currently represent. These are the schema additions that must land before the portals can be built on top of them.

| Scope reference | Required | Current state | Phase |
|---|---|---|---|
| §6a Quotations | status Draft / Sent / Under Review / Accepted / Expired + audit + notification | `varchar(50)`, no enum, no CHECK, no default, never written, no audit table | 2, 3 |
| §6a Invoices | status Pending / Paid / Overdue / Cancelled + audit + notification | `varchar(50)`, unconstrained, never written, no audit table | 2, 5 |
| §6a Subscriptions | status Active / Renewal Due / Expiring Soon / Expired / Cancelled + audit + notification | `varchar(50)`, unconstrained, only ever read (`status: "active"` filter), no audit table | 2, 5 |
| §6a Payments | status Pending / Confirmed / Failed + audit + notification | `varchar(50)`, unconstrained, never written, no audit table | 2, 5 |
| §6, §6a Documents | status + audit + notification | status enum and audit table both correct and complete. **Notification missing** | 2 |
| §8 Agent portal | agents see "assigned customers" | No assignment concept exists at all — no column, no join table, zero matches for `assign` in the codebase | 4 |
| §6 Document management | "document categorization" | No category or type column. Only a nullable `service_id`, which is a service reference, not a taxonomy | 4 |
| §4 Pricing | industry is a pricing input | `industries` table holds name and description only, no pricing weight. `pricing.engine.ts` accepts `industryId` and never uses it — **industry currently has zero effect on price** | 3 |
| §4 Pricing | admin-configurable quotation validity period | No settings table. `quotations.expires_at` exists but nothing computes it | 3 |
| §3 Public site | customer reviews | No entity, no table | 6 |
| §3 Public site | FAQs | No entity, no table | 6 |
| §3 Public site | Contact form | No entity, no table | 6 |
| §10 Automation | 8 categories of transactional email | `notifications_log` table exists with no writer. No email service. Worker queues are stubs | 2 |
| §11 Auth | "JWT-based authentication, HTTP-only cookies" | Tokens returned in the JSON body. No `res.cookie` anywhere, `cookie-parser` not installed, no CSRF protection | 1 |

---

## 3. Security defects to close in Phase 1

Found while auditing the current code. The first is severe and should be fixed before anything else is built on top of the auth module.

1. **`POST /api/auth/forgot-password` returns the password-reset token in the HTTP response body** (`auth.service.ts:302`). Anyone who knows an email address can request a reset and read the token straight out of the response, then take over the account. It must email the token and return an opaque success.
2. The same endpoint **404s on an unknown email**, which confirms which addresses are registered. It must return the same response either way.
3. **Agents, managers and admins cannot read documents at all.** Every read route on `/api/documents` is gated `authorize("customer")`, while the status-change route is `authorize("agent","admin")` — so a reviewer can approve a document they are unable to open. Managers are excluded from review entirely. This blocks the whole of scope §8.
4. **`manager` is granted the full admin surface.** `/api/admin` is mounted `authorize("admin","manager")`, which contradicts §8's "controlled, role-based access". Managers need their own boundary.
5. **`authenticate` trusts the JWT payload with no database lookup** (`authenticate.ts:30`), so a deactivated or role-demoted user keeps full access until their 15-minute access token expires.
6. **`reset-password` does not revoke existing refresh tokens**, so an attacker with a stolen refresh token survives the victim's password change.
7. **No MIME or extension allow-list on upload** (`document.router.ts:13-16`). Size is capped at 25 MB; content type is not checked.
8. `authorize(...roles: string[])` is untyped against the role enum, so `authorize("Admin")` compiles and silently denies everyone.
9. Non-customer accounts cannot be created through the API at all — `RegisterSchema` pins role to `customer` and the admin user endpoint is a stub. Agents and managers currently require direct database writes.

---

## 4. Decisions needed before the build proceeds

These three are yours (or the client's) to make. Each one changes work in a different phase, so settling them early avoids rework.

**A. Cookie auth or bearer tokens.** Scope §11 promises HTTP-only cookies. The code issues bearer tokens in the response body. Cookies are the safer default for browser portals and are what was signed for, but they require `cookie-parser`, `SameSite` configuration, a CSRF defence, and an exact `CORS_ORIGIN` per portal. Recommended: cookies for the four browser surfaces, keeping bearer support for testing and any future mobile client. Affects Phase 1.

**B. One repository or two.** The frontend does not exist yet. Adding `apps/web` to this repository keeps one Docker stack, one CI pipeline and shared TypeScript types; a separate repository decouples deploys. Recommended: same repository as `apps/web`, which adds a fifth container and therefore amends AGENT.md rule 5. Affects Phase 6.

**C. Payment gateway.** Scope §9 leaves this to the client's region and business account. Nothing else in Phase 5 can be finished without it. This is the single most likely cause of timeline slip, because it is a client dependency, not a development task. Ask for it in writing during Week 1 and build against a provider-agnostic interface so the choice can land late.

---

## 5. Phases

Each phase has an exit gate. Do not start the next phase until the gate passes — the later phases all sit on top of Phase 2, and reworking it after four portals depend on it is the expensive failure mode here.

### Phase 0 — Foundation · complete (2026-09-03)

Docker stack, environment validation, migrations, auth module, RBAC middleware, document workflow, pricing engine, health endpoints.

*Gate:* `docker compose up -d` reaches healthy; `GET /health/ready` returns 200. **Not yet verified by a real run** — see the closing note.

### Phase 1 — Security and auth correctness · code complete (2026-09-04), unrun

Close all nine defects in section 3. Decide item A above and implement it. Add `POST /api/admin/users` so agent and manager accounts can be created through the API. Type `authorize()` against `UserRole`. Split the `manager` boundary out of `/api/admin`. Add an `is_active` check to `authenticate`, cached in Redis so it costs one lookup per token lifetime rather than one per request. Introduce the MIME allow-list.

*Gate:* the reset-token leak is gone and covered by a test; an agent can fetch and download a document they are reviewing; a deactivated user is refused within seconds rather than 15 minutes; a manager receives 403 on admin-only routes.

All four gate conditions now have tests — `apps/api/test/auth-reset-token.test.ts` for the first, `apps/api/test/phase1-gate.test.ts` for the other three. **The suite has not been executed yet**, so the gate is written but not passed. It needs `npm install` (for the added `@types/jest`), `npm run typecheck`, `npm run typecheck:test`, `npm test`, and one `docker compose up` so migration `AddSessionInvalidation1700000001000` applies to a real database. Until that run happens, treat Phase 1 the same way as Phase 0: written, reviewed, unproven.

### Phase 2 — Shared status and notification fabric · Weeks 1–2

**The highest-leverage phase in the project.** Scope §6a asks for the same status-plus-audit-plus-notification behaviour on five modules. Build it once.

- One generic `status_history` table (`entity_type`, `entity_id`, `from_status`, `to_status`, `changed_by`, `note`, `created_at`) replacing the per-module approach. Migrate `document_status_history` onto it.
- Migration adding four Postgres enums: `quotation_status_enum`, `invoice_status_enum`, `subscription_status_enum`, `payment_status_enum`, with the exact values from §6a, plus defaults on the four columns that currently have none.
- A reusable transition guard, generalised from the working `document-status.ts` state machine, so illegal transitions are rejected in one place.
- A notification dispatcher that every status change calls: writes `notifications_log`, then enqueues a BullMQ email job. Nothing sends email inline on the request path.
- Real SES email service plus Handlebars templates for all 8 categories in §10.
- Worker: `email.queue` and `email.processor` genuinely working, with retries and a dead-letter path.

*Gate:* changing a document status writes one `status_history` row, one `notifications_log` row, and delivers one email through the worker. The same helper, called with a quotation, does the same thing without new code.

### Phase 3 — Catalog, pricing and quotations · Weeks 2–3

Replace the `/api/pricing`, `/api/packages` and `/api/quotations` stubs with real handlers. Wire the existing `pricing.engine.ts` to `POST /api/public/quotations/calculate`. Give `industries` a pricing weight and use it in the formula — today the input is accepted and silently ignored, which does not satisfy §4. Add the `settings` table for the admin-editable quotation validity period and compute `quotations.expires_at` from it. Persist quotations and their line items, with the full Draft → Sent → Under Review → Accepted → Expired lifecycle on the Phase 2 fabric. Admin CRUD for services, packages, package-to-service mapping, industries, worker ranges and locations.

*Gate:* a visitor can price a real configuration through the public API and the number is reproducible from the database rules alone; changing a location multiplier in the admin API changes the next quote with no deploy.

### Phase 4 — Document completion and assignment · Week 3

Add the `document_categories` table and CRUD. Add the agent-to-customer assignment table with endpoints, then scope the agent document queue to assigned customers only — this is what §8 means by "assigned". Wire expiry: a cron moves documents to `expiring_soon` then `expired` and fires reminders through the Phase 2 dispatcher. Admin document oversight endpoints.

*Gate:* an agent sees only their assigned customers' documents; an unassigned agent gets 403 on a specific document rather than an empty list; a document 30 days from expiry produces exactly one reminder, not one per cron tick.

### Phase 5 — Subscriptions, invoices, payments · Week 4

Subscription lifecycle with renewal dates. Invoice generation from a subscription. Payment gateway integration behind a provider-agnostic interface, with a signature-verified, idempotent webhook endpoint. Status cascade: a confirmed payment marks the invoice paid and extends the subscription, each transition flowing through the Phase 2 fabric.

*Gate:* a full paid cycle — invoice raised, payment confirmed by webhook, invoice `paid`, subscription extended, four notifications sent — runs end to end. Replaying the same webhook twice changes nothing the second time.

### Phase 6 — Frontend: public website and customer portal · Weeks 4–5

Stand up `apps/web` (Next.js App Router, TypeScript, Tailwind, shadcn/ui) as a fifth container. Add the three content tables the public site needs — `faqs`, `reviews`, `contact_submissions` — with public read endpoints and admin moderation.

Public pages: Home, About, Services, Packages, Contact, FAQs, reviews section, call-to-action blocks, and the SEO baseline (metadata per route, `sitemap.xml`, `robots.txt`, Open Graph tags, JSON-LD for the business). The pricing calculator lives here, unauthenticated, as the primary lead-generation surface.

Customer portal: dashboard, documents with upload and status tracking, quotations, subscriptions, invoices, payment history, notification centre.

*Gate:* every public page scores acceptably on Lighthouse mobile; a customer can complete the whole journey — price a job, register, upload a document, watch it reach `approved`, see the invoice — in the browser with no API client.

### Phase 7 — Frontend: admin dashboard and agent portal · Weeks 5–6

Admin dashboard covering all of §7: customers, agents, managers, services, packages, pricing rules, quotations, documents, subscriptions, invoices, payments, notification log, content moderation, analytics.

Agent and manager portal per §8: assigned customers, document review queue with approve and reject, service progress, and for managers, team view and assignment management.

*Gate:* an admin can configure every pricing rule, create an agent, assign a customer, and watch that agent's queue populate — without a database client.

### Phase 8 — Automation, deployment and hardening · Week 7

Remaining crons: document and quotation expiry scan, subscription renewal reminders, overdue-invoice sweep, database backup to the S3 backup bucket. CI/CD through `.github/workflows/deploy.yml`, which is currently a 13-line `echo` placeholder and validates nothing. TLS termination (the nginx config has a documented placeholder block, and `compose.prod.yml` already publishes 443 and mounts the cert volume). Rate-limit tuning, structured logging, error monitoring, and the basic technical documentation promised in §16.

*Gate:* a push to the deployment branch builds, runs typecheck and tests, and deploys. Every cron has run at least once in staging and is idempotent across ticks.

### Phase 9 — UAT and bug window · Week 8

The review period from §13. Bug fixes and minor UI adjustments within the agreed scope. Anything that arrives here as a new module or workflow change is quoted separately under §15 — hold that line, because this is the week the buffer gets consumed.

---

## 6. Roles

Four roles exist in `user_role_enum`: `customer`, `agent`, `manager`, `admin`. Scope §5, §7 and §8 imply the boundaries below. Two of them are wrong in the code today, noted inline.

**Customer** — owns their own records and nothing else. Every query is filtered by `customer_id = req.user.id` in the service layer, never by a client-supplied id. Can price jobs, request and accept quotations, upload and download their own documents, view subscriptions, invoices, payment history and notifications, and pay an invoice. Cannot see any other customer, cannot change any status. Registration is pinned to this role, which is correct.

**Agent** — the reviewer. Reads and downloads documents belonging to **assigned** customers only, moves documents through the review workflow, adds review notes, tracks service progress, and reads quotations for assigned customers. No billing access, no pricing configuration, no user management. *Currently broken:* an agent cannot read or download any document, because every read route is `authorize("customer")`.

**Manager** — the agent's superset plus oversight. Everything an agent can do across their whole team rather than a personal queue, plus assigning customers to agents, changing quotation status, and read-only access to subscriptions and invoices. Cannot manage users, pricing rules, or the service catalogue. *Currently broken:* `manager` is granted the entire `/api/admin` surface and is simultaneously excluded from the document-review route.

**Admin** — full control over every module in §7, including user and role management, the complete pricing configuration, content moderation for the public site, manual payment confirmation, and analytics. Ownership filters do not apply. Every admin mutation should land in the audit trail.

---

## 7. Network ports

Interpreting "every port that must have" both ways: the container ports are here, and the portal-by-portal endpoint list is in `docs/api-surface.md`.

| Service | Container port | Dev host binding | Prod host binding | Notes |
|---|---|---|---|---|
| `nginx` | 80, 443 | `80` (only under `--profile proxy`) | `80`, `443` | Only service reachable from outside the Docker network in production. TLS block is a documented placeholder until certificates exist |
| `api` | 3000 | `3000` | not published | Reached through nginx at `/api/`. `client_max_body_size` is 26 MB to sit just above multer's 25 MB cap |
| `web` (Phase 6) | 3000 | `3001` | not published | New container. Proxied at `/` by nginx, which currently returns a placeholder string there |
| `worker` | none | none | none | No listener. Consumes BullMQ queues only |
| `postgres` | 5432 | `127.0.0.1:15432` | not published | Localhost-bound in dev so host tooling works without exposing it to the network. Host side is 15432, not 5432 — Windows reserves TCP blocks for Hyper-V/WSL and 5432 would not bind |
| `redis` | 6379 | `127.0.0.1:16379` | not published | Localhost-bound; no password is set, so it must never be published to a network interface. Off the default port for the same reason as Postgres |

Container ports never change: the api and worker reach the dependencies as `postgres:5432` and `redis:6379` over the Compose network. Only the host-side publish ports moved, and only development publishes them at all.

Adding `web` takes the stack to five containers and therefore amends AGENT.md rule 5, which currently names four. That is recorded in `docs/decision-log.md`.

---

## 8. Sequencing risk

Ranked by how likely each is to cost the deadline.

1. **The payment gateway is a client dependency.** Phase 5 cannot close without credentials. Request them in Week 1, in writing, and build against an interface so a late answer costs a day rather than a week.
2. **Frontend is 0% and is over half the remaining work.** Four surfaces — public site plus three portals — in roughly two and a half weeks (Phases 6–7). This is the part of the estimate with the least slack. If something has to give, the admin dashboard is the place to ship a functional-but-plain UI first and polish in Week 8.
3. **Phase 2 is load-bearing for Phases 3, 4 and 5.** Building the status fabric per module instead of once turns roughly one week into roughly three and multiplies the notification bugs by five.
4. **Client content and pricing rules gate Phases 3 and 6.** §14 makes this the client's responsibility; §12 makes delays their timeline cost. Send one consolidated request in Week 1 rather than asking module by module.
5. **No automated tests exist.** `jest`, `ts-jest` and `supertest` are in `devDependencies` with no config and no `test` script. Phase 1 should land a working test harness, because from Phase 2 onward the status fabric needs regression cover — five modules sharing one code path means one bug reaches all five.

---

## 9. Verification status of Phase 0

Everything in Phase 0 was written and statically reviewed, but **nothing has been executed** — the sandboxed Linux environment used for builds failed to start throughout the session that produced it (`VM_DISK_SPACE_INSUFFICIENT`), so no `docker compose build`, no `tsc --noEmit`, and no container start has been confirmed.

Run this before starting Phase 1, and treat the Phase 0 gate as unmet until it passes:

```bash
cd E:\ConstructionWebsite\constDocManagment
docker compose build --no-cache
docker compose up -d
docker compose ps
docker compose logs -f api worker
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

Two known conditions when it runs: there is no `package-lock.json`, so both Dockerfiles use `npm install` rather than `npm ci` and the `development` and `production` stages can resolve different versions of the same caret range — generating a lockfile is a Phase 1 task. And `worker` gates on `api: service_healthy`, so an unhealthy API silently prevents the worker from starting at all; read the API logs first.





