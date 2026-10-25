# Decision Log

This file is intentionally small and append-only. Every meaningful technical choice should be added here as a new entry. Keep entries short and specific.

## 2026-09-01

### Decision
Use a split architecture with separate API and worker services, supported by Postgres, Redis, and Nginx.

### Why
The system has different responsibilities:
- API handles HTTP requests and auth
- Worker handles queues, scheduled jobs, and background processing
- Postgres stores core transactional data
- Redis handles queues, caching, and token management
- Nginx acts as the front door and security layer

### Result
This improves scalability, simpler production deployment, and easier fault isolation.

## 2026-09-01

### Decision
Use TypeORM with migrations instead of automatic synchronize in production.

### Why
Migrations make schema changes explicit, reviewable, and safe for deployment. This is more stable than auto-sync in production and helps onboard new developers.

### Result
Database changes are versioned and reproducible.

## 2026-09-01

### Decision
Keep environment values in `.env` and validate them through `config/env.ts`.

### Why
Secrets and runtime settings should not be hardcoded. Centralized validation reduces configuration mistakes and keeps the app readable.

### Result
The system is easier to deploy across dev, staging, and production.

## 2026-09-01

### Decision
Protect routes with JWT authentication and role-based checks.

### Why
The project includes customer, agent, manager, and admin roles. Access must be restricted based on role and ownership.

### Result
The API can support multi-role workflows without exposing admin-level data to customers.

## 2026-09-01

### Decision
Use Docker Compose for local orchestration and a production-focused compose file for deployment.

### Why
This keeps local development simple while allowing production deployment to add restart policies and cleaner service definitions.

### Result
The same project can be developed locally and deployed more safely in production.

## 2026-09-03

### Decision
Make environment validation strict and fail-fast in `config/env.ts`, and read config through the `env` object everywhere instead of `process.env`.

### Why
Every field was previously `.optional()`, so an empty `JWT_SECRET` passed validation and only surfaced later as a 500 on login, or worse as a token signed with an empty-string secret. Requiring `DATABASE_URL`, `REDIS_URL`, and both JWT keys (minimum 32 characters, and required to differ in production) turns a class of silent runtime failures into one readable error at boot. Empty strings are treated as absent because Compose passes unset variables through as `""`.

### Result
A misconfigured deployment refuses to start and names the offending variables. `auth.service.ts` and `middleware/authenticate.ts` no longer read `process.env` directly, so there is a single source of truth for config.

## 2026-09-03

### Decision
Require an explicit non-wildcard `CORS_ORIGIN` in production, and accept a comma-separated list of origins.

### Why
`cors({ origin: true })` reflects any requesting origin, which combined with credentialed requests would let any site drive an authenticated session. The platform also has several legitimate frontends (marketing site, customer portal, admin portal), so a list is needed rather than a single value.

### Result
Satisfies the "strict CORS" item on the production checklist. Wildcards remain available for local development only.

## 2026-09-03

### Decision
Resolve the TypeORM migrations glob relative to `__dirname` instead of switching on `NODE_ENV`.

### Why
The glob was `dist/migrations/**/*.js` in production and `src/migrations/**/*.ts` otherwise, both relative to the process working directory. Running compiled output with `NODE_ENV=development`, or starting the process from any other directory, silently matched zero migrations — `runMigrations()` then reported success against an empty schema and every query failed afterwards.

### Result
`path.join(__dirname, "..", "migrations", "*.{ts,js}")` resolves correctly under both `ts-node` and plain `node`, independent of `NODE_ENV` and the working directory.

## 2026-09-03

### Decision
Replace `CREATE TYPE IF NOT EXISTS` in the initial migration with guarded `DO $$ ... EXCEPTION WHEN duplicate_object $$` blocks, and make foreign-key creation idempotent via `DROP CONSTRAINT IF EXISTS` before each `ADD CONSTRAINT`.

### Why
PostgreSQL has no `IF NOT EXISTS` form for `CREATE TYPE`, so the statement was a syntax error. Since the API runs migrations at boot, the initial migration crashed the container on first start. The tables already used `CREATE TABLE IF NOT EXISTS`, so the file was clearly intended to be re-runnable; the `ADD CONSTRAINT` calls were not, and would fail on a partially migrated database.

### Result
The initial migration applies cleanly and is safe to re-run.

## 2026-09-03

### Decision
Give the worker a real entry point with its own config module, and keep queue, processor, and cron logic as explicitly marked TODO stubs.

### Why
`worker.ts` only exported `startWorker()` and nothing called it, so the container ran to completion immediately and restart-looped under `restart: unless-stopped`. The worker is a separate build context and cannot import the API's config, so it validates its own environment. It also lacked the `pg` driver despite depending on `typeorm`. Schema ownership stays with the API's migrations — the worker connects without an entity list and never mutates schema.

### Result
The worker boots, proves Postgres and Redis are reachable, stays alive, and shuts down cleanly. Unimplemented modules are labelled as such rather than returning `true` and reading as finished work.

## 2026-09-03

### Decision
Add a `development` stage to both Dockerfiles, run production images as the non-root `node` user, and use `tini` as PID 1.

### Why
The dev compose file mounted `./apps/api/src` into an image whose command was `node dist/server.js`, so edits had no effect and the mount was misleading. Splitting the Dockerfile lets development run `ts-node-dev` against the mounted source while production still ships only compiled output and runtime dependencies. `tini` forwards `SIGTERM` so the graceful-shutdown handlers actually run on `docker compose down`, and `.dockerignore` files stop host `node_modules` from overwriting the container's Linux-built native modules.

### Result
Hot reload works in development; production images are smaller, non-root, and shut down cleanly.

## 2026-09-03

### Decision
Set Redis `maxmemory-policy` to `noeviction`.

### Why
The config used `allkeys-lru`. BullMQ keeps job state in ordinary Redis keys, so under memory pressure Redis would evict queued jobs and renewal reminders would disappear with no error surfaced anywhere. `noeviction` makes Redis reject writes instead, which is loud and recoverable.

### Result
Queue durability no longer depends on staying under the memory limit by luck.

## 2026-09-03

### Decision
Separate liveness from readiness: `/health` stays dependency-free and `/health/ready` reports Postgres and Redis status.

### Why
The Docker healthcheck needs an endpoint that answers whenever the process can serve HTTP. Wiring it to a database check would let a brief Postgres blip mark the container unhealthy and trigger a restart, turning a transient fault into an outage. Orchestrators and deploy scripts still need a real dependency check, which is what `/health/ready` provides.

### Result
`/health` drives the container healthcheck; `/health/ready` returns 503 with a per-dependency breakdown when something is actually down.

## 2026-09-03

### Decision
Build `DATABASE_URL` in the compose files from the `DB_*` parts in `.env`, and keep localhost values in `.env` for host-side tooling.

### Why
`compose.prod.yml` hardcoded `postgres://user:pass@postgres:5432/construction_db` while Postgres itself was configured from `${DB_USER}`/`${DB_PASS}`, so the API authenticated with credentials the database had never been given. Hardcoded credentials in a committed file also violate the environment-configuration rule. Deriving the URL from the same variables Postgres uses means the two cannot drift. `env_file: .env` was added so values like `CORS_ORIGIN` and `JWT_EXPIRES_IN` reach the containers at all; `environment:` entries override it, which is how the container hostnames win over the localhost defaults.

### Result
Credentials live in one place. Postgres and Redis are no longer published to the host in production, and both stacks gate startup on healthchecks rather than plain `depends_on`. In local development they are published on `127.0.0.1` only, since neither has a password.

## 2026-09-03

### Decision
Set `client_max_body_size 26m` in nginx and raise the proxy timeouts on `/api/`.

### Why
nginx defaults to a 1 MB request body, while `document.router.ts` configures multer for 25 MB. Every document upload above 1 MB would have been rejected by the proxy with a bare HTML 413 and never reached the application. The limit is set slightly above multer's so the API is the component that rejects an oversized file and can return the usual JSON error shape.

### Result
Uploads work through the proxy, and the size limit is enforced in one place with a real error message. The commented TLS block documents what to add once certificates exist for a real domain, rather than committing a hardcoded domain.

## 2026-09-03

### Decision
Bound the `/health/ready` dependency checks with a 2 second timeout.

### Why
BullMQ requires ioredis to be configured with `maxRetriesPerRequest: null`, which means a command issued while Redis is unreachable is queued until it reconnects instead of failing. An unbounded `ping()` would leave the readiness endpoint hanging in precisely the situation it exists to report on.

### Result
`/health/ready` always answers, and reports a dependency as down rather than never responding.

## 2026-09-03

### Decision
Pin the enum type names on entities with `enumName`, and give `document_status_history.from_status` the enum type the migration actually creates.

### Why
TypeORM derives enum type names as `<table>_<column>_enum`, so its metadata expected `users_role_enum` and `documents_status_enum` while the migration creates `user_role_enum` and a single shared `document_status_enum`. The entity also declared `from_status` as `varchar(50)` against an enum column. Neither breaks at runtime under `synchronize: false`, but both would make a generated migration try to "repair" a schema that is already correct. Two `@Index()` decorators (`locations.is_active`, `worker_ranges.is_active`) had no matching index in SQL and were added.

### Result
Entity metadata and the initial migration now describe the same schema.

## 2026-09-03

### Decision
Implement the scope document's §6a status-and-notification requirement once, as shared infrastructure: a single generic `status_history` table plus one dispatcher that every module calls, rather than a status-history table and notification path per module.

### Why
§6a applies the identical pattern — status field, audit trail, notification on every change — to documents, quotations, invoices, subscriptions and payments. Building it five times is five times the work and five times the places a missed notification can hide. The existing `document_status_history` table and the `document-status.ts` state machine already prove the pattern; generalising them costs roughly a week and unblocks three later phases, whereas per-module implementations would consume roughly three weeks of an eight-week timeline. The dispatcher also keeps email off the request path: it writes `notifications_log` and enqueues a BullMQ job rather than calling SES inline.

### Result
Recorded in `docs/delivery-plan.md` as Phase 2, gating Phases 3, 4 and 5. `document_status_history` will be migrated onto the shared table rather than left as a special case.

## 2026-09-03

### Decision
Add the Next.js frontend as a fifth container, `web`, inside this repository at `apps/web`.

### Why
AGENT.md rule 5 names four stable service boundaries (`api`, `worker`, `postgres`, `redis`, `nginx`); the frontend does not exist yet, so this amends that list. One repository keeps a single Docker stack, a single CI pipeline, and shared TypeScript types between the API contract and the four browser surfaces — worth more on a solo eight-week build than the deploy independence two repositories would give. nginx already proxies `/api/` and returns a placeholder string at `/`, which becomes the `web` upstream.

### Result
Five containers. `web` listens on 3000 internally and is published on host 3001 in development to avoid colliding with the API; in production it is not published, and only nginx is reachable from outside the network.

## 2026-09-03

### Decision
Move the unauthenticated routes under an explicit `/api/public` prefix.

### Why
`/api/quotations`, `/api/pricing` and `/api/packages` are currently mounted with no authentication middleware, which is correct for a lead-generating pricing calculator but invisible from the route table — the authentication boundary should be legible in the URL rather than inferred from `app.ts`. A distinct prefix also lets nginx and the rate limiter treat the public surface differently from authenticated traffic, which matters because the calculator is the most exposed endpoint in the product. All three mounts are hardcoded stubs today, so the move costs nothing now and gets more expensive with every portal built against the old paths.

### Result
Documented in `docs/api-surface.md`. Authenticated namespaces become `/api/customers`, `/api/agent`, `/api/manager` and `/api/admin`, with `manager` split out of the admin surface it currently inherits in full.

## 2026-09-03

### Decision
Publish Postgres and Redis on non-default host ports in development — `127.0.0.1:15432` and `127.0.0.1:16379` — while leaving the container ports at 5432 and 6379.

### Why
`docker compose up` failed on Windows with `bind: An attempt was made to access a socket in a way forbidden by its access permissions` on `127.0.0.1:5432`, which stopped the whole stack before any container started. Windows reserves TCP port blocks for Hyper-V and WSL, and a port inside a reserved range is unbindable even though nothing is listening on it; a locally installed PostgreSQL service produces the same symptom. Moving the host side resolves both causes without requiring an administrator to restart WinNAT, and the change is invisible to the application because `api` and `worker` connect over the Compose network as `postgres:5432` and `redis:6379`, which `environment:` sets and `env_file:` cannot override.

### Result
The stack starts on a default Windows/Docker Desktop install. `DATABASE_URL` and `REDIS_URL` in `.env` now carry the same host ports so host-side tooling keeps working. Production is unaffected — `compose.prod.yml` does not publish either service.

## 2026-09-04

### Decision
Restore `manager` as a distinct database role instead of removing it while restricting the `/api/admin` mount to admins.

### Why
The signed scope defines four roles: customer, agent, manager, and admin. The Phase 1 RBAC change correctly removed managers from the admin surface, but it also deleted the enum value, which would make the manager's documented oversight and approval permissions impossible to represent. The entity and initial schema now retain the role, while a forward migration adds it to databases that already ran the original three-value enum. PostgreSQL cannot remove enum values in place, so rollback leaves the value intact rather than risking destructive data loss.

### Result
Managers remain distinct from admins, can use staff document read and approval paths, and still receive 403 from `/api/admin`. The regression is covered by `apps/api/test/phase1-gate.test.ts`.

## 2026-09-04

### Decision
Replace JWT password-reset tokens with opaque random values held in Redis, add a `typ` claim to every issued JWT, and require the current password before an email address can change.

### Why
`POST /api/auth/forgot-password` returned a JWT signed with `JWT_SECRET` — the same key `authenticate` verifies against — and `authenticate` never asked what a token was *for*. A reset token was therefore a working session credential, and the token was in the response body, so knowing an address was enough to take over the account. Fixing only the visible half (the token in the body) would have left the cross-use open. A signed token also cannot be withdrawn once issued, whereas a server-side value is revocable by construction, expires by TTL, and can be consumed atomically so a link works exactly once. Only the SHA-256 hash is stored, so a Redis dump does not hand over usable links — the same reasoning already applied to refresh tokens. The email rule closes the other end: email is the identity reset trusts, so an attacker holding a stolen access token could otherwise point the account at their own address and make the takeover permanent.

### Result
The reset token exists only inside the email. `forgot-password` returns a byte-identical response for known and unknown addresses, and for disabled accounts, so it is no longer an enumeration oracle. `authenticate` requires `typ === "access"`, which retires every pre-`typ` token. `consumePasswordResetToken` reads and deletes inside one MULTI rather than relying on GETDEL, so single use holds under a race and on any Redis version. Covered by `apps/api/test/auth-reset-token.test.ts`.

## 2026-09-04

### Decision
Resolve the caller's current database row on every authenticated request — active flag, role, and a new `tokens_valid_from` cut-off — and cache it in Redis for 30 seconds.

### Why
A signed access token is a snapshot taken at login. Nothing in it changes when an admin disables the account or demotes the role, so a 15-minute token is a 15-minute window in which a fired employee keeps their old access. The gate wording is "within seconds", which rules out waiting for expiry. Reading the row per request without a cache would add a query to every call; 30 seconds is short enough to satisfy the requirement on its own and acts as the ceiling on staleness if an explicit invalidation is ever missed. `tokens_valid_from` exists because revoking refresh tokens alone leaves an already-issued access token live — it moves a cut-off that stateless tokens are then compared against. The comparison truncates both sides to whole seconds, since `iat` has one-second resolution and a millisecond cut-off would reject the token minted by the very login that follows a password reset.

### Result
Migration `AddSessionInvalidation1700000001000` adds the column. `authenticate` takes the role from the row rather than the token, so a demotion is honoured on the next request; every path that changes `role`, `is_active` or `tokens_valid_from` calls `invalidateSessionCache`. A Redis outage falls through to the database rather than locking everyone out, but an unresolvable account is refused with 503 instead of admitted on the strength of a token.

## 2026-09-04

### Decision
Make `/api/admin` admin-only, give `manager` its powers on the routes the role actually needs, add `POST /api/admin/users`, and type `authorize()` against the `UserRole` enum.

### Why
The admin surface was mounted `authorize("admin", "manager")` as a single block, which handed managers user management, pricing configuration and analytics — none of which the scope document gives them — while `PATCH /api/documents/:id/status` omitted `manager` entirely, so the role accountable for approvals could not approve anything. Both halves were the same mistake: role checks written per mount, in strings. `authorize` accepting `string` had a silent failure mode, since `authorize("Admin")` compiled and then denied everyone; against the enum a typo is a build error. `POST /api/admin/users` exists because `POST /api/auth/register` pins the role to `customer`, which left manual SQL `INSERT`s as the only way an agent, manager, or admin account could exist.

### Result
Managers get 403 on every `/api/admin` route and 200 on the document decisions they own. Staff accounts are created through the API, with the address normalised to lower case on the way in and no password hash in any response. An admin cannot disable their own account, which would otherwise be an unrecoverable lockout. `STAFF_ROLES` is named once rather than spelled out per route, so widening or narrowing "staff" is a single edit.

## 2026-09-04

### Decision
Open document reads to staff and decide ownership in one service-level helper rather than at each route.

### Why
Every read route was `authorize(UserRole.Customer)`, so an agent or manager could not open a document they were assigned to review — the product's core workflow was unreachable through its own API. Moving the decision into `assertCanReadDocument` rather than duplicating it per route is the more important half: the previous per-method copies had already diverged, and Phase 4 adds agent-to-customer assignment scoping, which has to land in exactly one place to be worth trusting.

### Result
The owning customer or any staff member can read; one customer still gets 403 on another's document, and no credential is 401 rather than 403. Writes stay with the customer — a reviewer cannot replace the bytes under review. Staff currently see all documents: narrowing agents to their assigned customers needs the assignment table, which does not exist yet, and is marked `TODO(phase-4)` in the helper rather than left implicit.

## 2026-09-04

### Decision
Constrain uploads with a MIME-plus-extension allow-list, give the credential endpoints their own rate limit, trust exactly one proxy hop, and stop unhandled errors from describing themselves in the response.

### Why
Upload validation checked size only, so an HTML or SVG file could be stored and later served from our own origin — that is how a stored XSS reaches a portal that previews attachments. Both the reported MIME type and the extension must match, and the pairing is deliberate rather than either alone; a client controls both, so this is the cheap check, not proof of content, and real sniffing belongs with the antivirus job in Phase 2. The general limit of 100 requests a minute is generous enough to walk a password list all day, so login, register, forgot-password and reset-password are counted separately at ten *failures* per quarter hour — counting only failures means a person who mistypes once and then succeeds is not penalised, and a burst of guesses cannot consume the caller's whole quota and turn a guessing attempt into a denial of service. `trust proxy` is set to `1` and not `true`: nginx terminates the connection, so without it every request appears to come from the proxy and all clients share one bucket, but trusting the whole chain would let a client forge `X-Forwarded-For` and mint a fresh quota per request. Unhandled errors were returned verbatim, which for a `QueryFailedError` means the response names tables and columns.

### Why the SQLSTATE is read from two places
TypeORM copies the Postgres error code onto the `QueryFailedError` wrapper in some versions and leaves it only on `driverError` in others. Checking a single location would have silently missed unique violations and reported them as 500.

### Result
Nine allowed types covering PDFs, office documents and certificate photographs; anything else is 415, an oversized file 413, and multer's own errors take the API's error shape instead of becoming a 500. A unique violation is 409 with a fixed message. Every other unexpected failure is a generic 500 in the response and a full stack trace in the log, where it belongs.

## 2026-09-04

### Decision
Test the API with Postgres, Redis and SES replaced by in-memory fakes at the `config/` and `utils/` module boundary, using Jest's `moduleNameMapper`, so the Phase 1 gate is provable with nothing running.

### Why
The gate requires a test, but the client has not been able to verify the AWS or email credentials, so nothing may be built that depends on them working and nothing depending on them may be reported as working. An integration suite needing `docker compose up` would not have been runnable at all. Substituting whole modules rather than injecting seams works here because every service already fetches its repository lazily inside the calling function and guards on `AppDataSource.isInitialized` — so not one source file needed a test hook added to it, which was the deciding factor. `utils/email` is mapped globally rather than per file specifically so that no test can reach SES even by accident, and `AWS_REGION`/`S3_BUCKET` are deleted from the environment so `utils/s3` reports S3 as unconfigured and the local `res.download` path — the one that actually runs today — is the one under test. `DOTENV_CONFIG_PATH` points at an empty file, because otherwise a developer's `.env` would decide whether a download returns bytes or a presigned redirect.

### Result
`npm test` in `apps/api` runs the gate on a laptop with no database, no cache, and no credentials. The fake repository throws on any TypeORM find operator it does not implement rather than returning an empty result, because a fake that silently answers "no rows" turns a real defect into a passing test. Integration tests against live Postgres are a separate suite, added alongside the worker in Phase 2.

## 2026-10-03

### Decision
Store all pricing configuration and application settings in the database, making them fully admin-editable with soft deletes, validation rules, and an audit trail.

### Why
- **Industry Weight Formula**: Multiplies the worker base price together with the location multiplier (`workerBasePrice × locationMultiplier × industryWeight`). Default weight is 1.0000, so existing prices do not change. Only the worker-base portion is scaled; fixed service add-ons and city fees are not scaled by industry weight.
- **Soft Delete**: Deleting any pricing entity (service, industry, worker range, location) sets `isActive = false` instead of executing a hard DELETE. Existing quotations and audit histories reference these rows by foreign key, so deleting them from the database would orphan records or violate referential integrity constraints.
- **Settings Whitelist & Validation**: The `app_settings` table uses a string primary key (`key`), a `jsonb` value column, and an `updated_by` audit column. To prevent unvalidated state corruption, write operations are strictly restricted to a whitelist (`currency`, `quote_validity_days`). Currency requires a 3-letter uppercase ISO-4217 code; quote validity requires an integer between 1 and 365 days.
- **Worker Range Integrity**: Overlapping active ranges are rejected at validation time. `minWorkers` must not exceed `maxWorkers`. Only the highest active range may have an open-ended (null) `maxWorkers`.

### Result
Pricing calculation is entirely DB-driven and configurable via `/api/admin/services`, `/api/admin/industries`, `/api/admin/worker-ranges`, `/api/admin/locations`, and `/api/admin/settings`.

## 2026-10-05

### Decision
Support staff-created quotations with customizable line items (fees and discounts) and extended quotation statuses (`converted` and `cancelled`).

### Why
- Staff (agents, managers, admins) need to generate quotations on behalf of registered customers and apply adjustments like government fees and commercial discounts.
- Line items are tracked individually with `kind`, `quantity`, `unit_price`, and `line_total` for transparent billing and itemization.
- The pricing engine recalculates core worker and service charges, while extra lines are constrained (amounts > 0, max 20 extra lines, discounts capped at the calculated subtotal). Total calculations use integer cents to prevent floating point inaccuracies.
- Lifecycle tracking expands with `cancelled` (from draft or sent) and `converted` (from accepted into an active project or subscription). Once converted or cancelled, further transitions are disallowed.

### Result
- Added migration `1790000000000-QuotationLineItems.ts` and updated `QuotationItemEntity`.
- Added `POST /api/agent/quotations` and `POST /api/admin/quotations` with RBAC and zod validation.
- Updated `QuotationStatus` and state machine transitions.









## 2026-10-11

### Decision
Status-change notifications are enqueued to the BullMQ `email` queue through `apps/api/src/modules/notifications/notify.service.ts` instead of being written to `notifications_log` only or sent inline from request handlers.

### Why
- Email delivery must not block or fail an API request; the worker sends asynchronously and moves exhausted jobs to `email-dead-letter`. Known gap: the API-side `Queue` in notify.service.ts has no `defaultJobOptions`, so API-enqueued jobs use BullMQ's default single attempt (the worker queue's 3-attempt backoff does not apply to them).
- One dispatcher maps each event type (quotation sent/accepted/rejected, document approved/rejected, invoice issued, payment recorded) to a Handlebars template rendered by the worker.
- A `notifications_log` row is written as `queued` per event and flipped to `failed` if enqueueing fails, so delivery problems are visible.

### Result
- `notify()` is called on every quotation and document status change. Sent/accepted/rejected (quotation) and approved/rejected (document) enqueue an email; other transitions are logged as `channel=in_app, status=recorded` (types `quotation_status_changed`, `document_status_changed`) so every change is still recorded. Invoice and payment events are defined but not yet emitted.
- Quotation emails use the quotation currency, falling back to the `currency` setting, then MXN.
- The Redis/BullMQ connection lives in `modules/notifications/email-queue.ts`; tests map it to `test/support/email-queue.fake.ts` (same pattern as config/redis). Previously the suite opened a real Redis connection that kept Jest from exiting.
- Added `bullmq` to the API, templates `quotation-accepted`, `quotation-rejected`, `payment-recorded`.
- Added `GET /api/admin/documents` (paginated) and `PATCH /api/admin/documents/:id/status` (admin override, note required).


## 2026-10-11

### Decision
API responses never embed a raw `UserEntity`. Services pass any loaded user relation through `toPublicUser()` (`apps/api/src/utils/serialize-user.ts`), exposing only `id, email, name, phone, role`.

### Why
- Quotation endpoints loaded `relations: { customer: true }` and returned the entity, leaking every customer's `passwordHash` and `tokensValidFrom`. Agents can list all quotations, so any agent could collect every customer's bcrypt hash.
- An audit of every user-loading path found quotations to be the only leak: auth, users, admin users and customer profile already use explicit serializers; document and payment user relations are declared but never loaded.

### Result
- Sanitized in `quotation.service.ts` `list()`/`get()`, which back all 14 JSON quotation endpoints (admin, agent, customer, `/api/quotations/:id`).
- `test/no-user-secrets.test.ts` covers each endpoint; the fake DB now hydrates `QuotationEntity.customer` from the users table so the tests fail without the fix.


## 2026-10-11

### Decision
The Phase-0 demo seed (`apps/api/src/scripts/seed-phase0.ts`) uses Mexican locations and industries and adds a second customer and agent.

### Why
- The client is Mexican (currency MXN); the earlier Punjab/Lahore location did not fit the demo.
- Phase E agent–customer assignment scoping needs more than one customer and agent to demonstrate.

### Result
- Locations: `Ciudad de México` (×1.15, fee 3500), `Nuevo León / Monterrey` (×1.10, 3000), `Jalisco / Guadalajara` (×1.00, 2500). CDMX backs the sample quotation.
- Industries carry `priceWeight`: Construction 1, Manufacturing 1.2, Logistics 1.1.
- Added `customer2@test.com` and `agent2@test.com` (same demo passwords as the Phase-0 users).
- The seed stays additive (find-or-create), so existing databases keep their old rows; use `npm run db:reset` for a clean Mexican-only dataset.


## 2026-10-11

### Decision
Added migration `1820000000000-DocumentApprovedUpload` to create the `documents.approved_*` columns.

### Why
- `DocumentEntity` has declared `approvedFileName`, `approvedS3Key`, `approvedUploadedBy`, `approvedUploadedAt` since the approved-upload feature was added, but no migration ever created those columns. Every query selecting a document (customer dashboard, documents page, admin/staff review queues, approved downloads) failed at runtime with `column DocumentEntity.approved_file_name does not exist`.
- The gap was invisible to the test suite, which runs against an in-memory fake DB, not the migrated Postgres schema.

### Result
- The migration adds the four columns (nullable) plus `FK_documents_approved_uploaded_by` → `users(id) ON DELETE SET NULL`, matching the entity.
- `down()` drops the constraint then the columns. Applied with `npm run db:migrate`; the customer dashboard and document endpoints now return 200.

## 2026-10-12

### Decision
Entity↔migration drift is treated as a recurring defect class, not a series of one-off bugs. Every schema or persistence change is now verified against real Postgres with `npm run smoke` (`apps/api/src/scripts/smoke.ts`), which drives the whole milestone story over HTTP against a running API.

### Why
- The Jest suite maps the data source to an in-memory fake (`apps/api/jest.config.js` `moduleNameMapper`), so it cannot see a column that exists on an entity but not in Postgres, a column that exists in Postgres but on no entity, or a relation that is never persisted. All 120 tests passed while three such defects were live.
- `1820000000000-DocumentApprovedUpload` was the first instance. Three more were found on the live database on 2026-10-12, each of which broke a step of the paid milestone story:
  - `payments.status` was `varchar(50) NOT NULL` with no default (`1700000000000-InitialSchema.ts:279`), while `PaymentEntity` has no `status` property and nothing writes one. **Every payment insert failed.** `1810000000000-InvoicePayments` could not fix it because its `CREATE TABLE IF NOT EXISTS "payments"` is a no-op on an already-migrated database.
  - `quotation_items.service_id` was `uuid NOT NULL` (`InitialSchema.ts:164`) while `QuotationItemEntity` declares `nullable: true`. `quotationService.staffCreate` inserts `serviceId: null` for its `worker_base`, `gov_fee` and `discount` lines, so **every staff-created quotation failed.**
  - `QuotationEntity.items` declared `@OneToMany` with **no `cascade`**, while both `create()` and `staffCreate()` build their line items inline and rely on `save()`. TypeORM silently discarded them: `quotation_items` held **zero rows** across every quotation ever created, so no quotation was itemised in Postgres even though the fake repository returned a full object graph to the tests.
- `payments.gateway_ref` (`InitialSchema.ts:277`) is on no entity and was already backfilled into `reference`; it is dropped rather than left as an untracked column. Named gateway reference columns arrive with the payment-gateway work.

### Result
- Migration `1830000000000-FixSchemaDrift`: drops `NOT NULL` on `quotation_items.service_id`, drops `payments.status` and `payments.gateway_ref`, and gives `subscriptions.status` a default of `active`. Its `down()` backfills before restoring `NOT NULL` and fails loudly rather than deleting rows.
- `QuotationEntity.items` is now `{ cascade: ["insert"] }`. Line items persist; a staff quotation stores its `worker_base`, city-fee and extra-line rows with a null `service_id`.
- `npm run smoke` is the authoritative gate from now on: a green `npm test` is not evidence that a persistence change works. Steps this build has not delivered yet print `SKIP` with the owning phase, so the script is also the milestone scoreboard.


## 2026-10-14

### Decision
A full code-truth audit of all three repositories is recorded in `docs/build-audit-2026-10-14.md`,
and that document — not `docs/delivery-plan.md` — is now the reference for project status.
`delivery-plan.md` has been corrected inline (markers: `[2026-10-14]`) and remains the record of what
was *planned*. `docs/api-surface.md` remains the endpoint specification.

### Why
- `delivery-plan.md` had not been touched since 2026-09-16 while the code ran to 2026-10-12. It still
  asserted "the entire frontend... zero `.tsx` files", "the frontend is 0%", that `deploy.yml` was a
  13-line echo placeholder, and that no automated tests existed. All four were false.
- Status was being read from a document a month out of date, which is how the `apps/web` plan and the
  two-repo reality coexisted in the docs without anyone noticing they contradict.

### Result
- Measured state: backend ~54%, frontend ~34%, **~43% of scope overall**. Static analysis only —
  `npm run smoke` could not run (Docker was down), so every figure carries an error bar.
- Verified green: `npm run typecheck`, `npm run typecheck:test`, `npm test` (11 suites, 120/120),
  worker `tsc --noEmit`, and both frontends' typecheck + lint + vitest + production build.
- 20 deviations from the scope documents catalogued, with the five most consequential being: bearer
  tokens instead of the HTTP-only cookies promised by scope §11; `payments.status` deliberately
  dropped in `1830000000000-FixSchemaDrift` while the gateway is still in scope; **no unified
  `status_history`** (built per module, which `delivery-plan.md` §8 itself ranked the #3 timeline
  risk); accepting a quotation creates neither invoice nor subscription; and no `faqs`/`reviews`/
  `contact_submissions` tables, so those public pages are hardcoded.
- 12 client blockers listed. `Requirements_Clarification_Questionnaire.md` has 16 sections and all 16
  are still blank; `docs/client-decisions.md` lists 7 topics with no answers.

---

## 2026-10-14

### Decision
Decision **B** from `delivery-plan.md` §4 ("one repository or two") resolved as **two separate
repositories**, against that document's own recommendation. The `apps/web` fifth container is
cancelled. AGENT.md rule 5's container list stays as it is.

### Why
- The frontends were built as independent git repositories at `../customer-portal` and
  `../admin-frontend` before the decision was formally taken. This entry records the fact rather than
  pretending the choice is still open.
- The earlier entry in this log describing `apps/web` as a planned fifth container is **superseded**.

### Result
- No `web` service exists in `compose.yml` or `compose.prod.yml`, and **neither frontend is
  containerised** — no Dockerfile, no `output: "standalone"`, no nginx upstream. nginx still returns
  a hardcoded placeholder at `/`.
- The costs the single-repo option would have avoided are now live: no shared TypeScript types (each
  repo hand-maintains a `types.ts` mirroring the API entities), no shared CI, and version drift —
  `customer-portal` on Next 16.3.5 / React 19.2.8 against `admin-frontend` on Next 15.5.7 /
  React 19.1.0, with nothing enforcing either.

---

## 2026-10-14

### Decision
Four scoping decisions taken with the client-side stakeholder during the audit:
1. The authoritative scope document (MJPRODS Scope v1.0) is **not in any repository** and will be
   supplied. Until it lands, scope is measured against `delivery-plan.md` + `api-surface.md` as an
   interim baseline.
2. "60% of scope" means **a coherent, demoable product slice**, not 60% of remaining hours.
3. The **online payment gateway remains in scope**. The drift to offline-only payments
   (`bank_transfer`/`spei`/`cash`/`other`, with `payments.status` dropped) must be reversed.
4. The `catalog` module (`catalog_categories`, `catalog_items`, `catalog_fields`,
   `catalog_field_values`, `catalog_images` — 5 tables, ~530 LOC, 24 routes) is **unscoped extra
   work**. It is excluded from completion figures and frozen, not extended.

### Why
- Each answer changes a different phase, and three of them had been silently assumed in code: the
  gateway had been designed out, and the catalog module had been built without appearing in any scope
  document.

### Result
- The payment seam (status enum, provider-agnostic `PaymentGateway` interface, idempotent
  signature-verified webhook) is scheduled so a late provider choice costs a day rather than a week.
  It is blocked on the client supplying provider and credentials — ranked the #1 schedule risk.
- `catalog` is frozen. Note that the pricing engine reads only the **old** `services` / `packages` /
  `industries` tables, so the two models are not interchangeable.

---

## 2026-10-14

### Decision
`tasks/` holds specs for unattended Claude Code runs, governed by `tasks/RUNNER-RULES.md` and a
`permissions.deny` list in `tasks/runner-settings.json`. Five independent backend tasks are specified.

### Why
- `.env` on this machine holds live `AWS_SECRET_ACCESS_KEY`, `SES_SECRET_ACCESS_KEY`, `JWT_SECRET`,
  `JWT_REFRESH_SECRET` and `DB_PASS`. A prose instruction not to read it is not enforcement; an
  unattended agent that reads it to "check the config" and quotes a line into a blocker file has
  written a real credential to disk. A `deny` rule beats `bypassPermissions` and holds regardless of
  what the model decides.
- An unattended run must not be able to change authorisation. Task 05 therefore builds the
  `agent_customer_assignments` table, entity and service but is **forbidden** from touching
  `assertCanReadDocument` or mounting any router — so the agent-sees-every-customer gap stays open
  until a reviewed change closes it.

### Result
- Migration timestamps are **pre-assigned** per task (`1840000000000` packages,
  `1850000000000` assignments) because the tasks may run on parallel branches and would otherwise
  both claim the next slot.
- Cardinality for `agent_customer_assignments` is **many-to-many**, `UNIQUE (agent_id, customer_id)`.
  Client question C6 ("can one customer be assigned to multiple agents?") is unanswered, and
  narrowing a constraint later is a simpler migration than widening one after real rows exist.
- Quotation pagination is **opt-in** — `{data, pagination}` only when a pagination parameter is
  present, bare array otherwise — because three live frontend pages type the response as
  `Quotation[]` and would break unattended.
- Tasks 02 and 05 declare themselves **incomplete without `npm run smoke`**, per the 2026-10-12
  entry: the Jest fake DB cannot see entity/migration drift.


## 2026-10-14

### Decision
Agents are scoped to their assigned customers for documents and quotations. Managers and admins are
not. The gate is one helper plus one guard:

- `assignmentService.customerScopeFor(actor)` returns the customer-id filter a list must apply, or
  `null` for an unrestricted actor. Both `/api/agent/documents` and `/api/agent/quotations` go
  through it, so "what an agent may list" is decided once.
- `document.service.ts` `assertCanReadDocument` is the single per-record guard, now `async`, and
  `updateDocumentStatus` and `assertCanUploadApprovedVersion` both call it.

`/api/manager` is mounted with `GET`/`POST /assignments` and `DELETE /assignments/:id`, for
**manager and admin**.

### Why
- `assertCanReadDocument` returned early for every staff role behind a `TODO(phase-4)`, so any agent
  could read, download and approve every customer's documents. `docs/api-surface.md` acknowledged it
  in prose; the matrix claimed `asg`.
- **The write path had no ownership check at all.** `updateDocumentStatus` gated on
  `canMutateDocumentStatus(actor.role)` and never consulted the read guard, so scoping reads alone
  would have left an agent able to approve a document they are forbidden to open — the mirror image
  of the original defect. Authorisation now runs before the `fromStatus` and transition checks, so an
  unassigned agent gets 403 rather than 409.
- **"Manager sees their team" could not be implemented from the data.** `users` carries only name,
  phone, email, passwordHash, role, isActive and tokensValidFrom — no `manager_id`, no teams table,
  no branch or region. The only manager-adjacent column in the schema is
  `agent_customer_assignments.assigned_by`, and keying a team off it fails openly: it is nullable and
  `ON DELETE SET NULL`, so assignments made by an admin, or whose creating manager was deleted, would
  belong to no manager and become invisible to all of them. Inventing a team shape here would have
  pre-empted the unanswered client question in `docs/client-decisions.md` ("Can agents see only
  assigned customers, or all customers in a branch/team?"), so managers stay organisation-wide and
  the matrix was corrected to say so.
- A customer assigned to nobody is invisible to every agent. The alternative — treating an
  assignment as something that only ever *narrows* — would have left the exposure open for every
  customer nobody has assigned yet, which today is all of them.

### Result
- `apps/api/src/modules/manager/manager.router.ts` and
  `apps/api/src/modules/assignments/assignment.schema.ts` are new. `assignmentService` gains
  `removeById`, `list` and `customerScopeFor`. `assignedBy` is read from the token, never the body.
- An agent with no assignments gets `[]` from both lists, not everything. The helper distinguishes
  `[]` from `null` for exactly this reason, and callers short-circuit before building an `In([])`,
  which Postgres rejects.
- `DELETE /assignments/:id` 404s an unknown id, unlike `unassign(agentId, customerId)` which reports
  `{ deleted: false }`. Naming a specific record and being told "fine" would hide a stale id in a UI.
- **`npm run smoke` needed a new step.** Story 7 has `agent@test.com` move a document owned by
  `customer@test.com`, which the narrowing correctly refuses. Smoke now creates the assignment
  through `POST /api/manager/assignments` first, so the gate exercises the new endpoint instead of
  working around it. 18 passed, 0 failed, the same 4 not-built-yet steps.
- Nine existing tests asserted the old permissive behaviour and now seed an assignment via a new
  `seedAssignment` harness helper. That those nine failed is the evidence the change bites.
- Verified over HTTP against real Postgres, which the Jest fake DB cannot do: the assigned agent gets
  200 on a direct fetch and sees the row in the queue; an unassigned agent gets 403 on the fetch,
  403 on the status change, and 0 rows. Manager sees 12 rows, an agent with no assignments sees 0,
  and an agent gets 403 on `/api/manager/assignments`.
- Suite: 16 files / 181 tests, up from 14 / 157.

### Still open
Agent scoping for `/api/customers`-style customer lists does not exist because no
`GET /api/agent/customers` endpoint exists yet. `GET /api/manager/team`,
`POST /assignments/bulk` and `GET /reports/workload` remain NEW. A real team boundary for managers
is blocked on the client.

## 2026-10-14

### Decision
Added `PATCH /api/admin/packages/:id/status` ({ isActive }) and made `packageService.update`
persist `description`, `sortOrder` and `isFeatured`.

### Why
The admin Packages UI needs to retire/restore a package and to edit its catalogue copy.
Two gaps blocked that: (1) there was no way to flip `isActive` — `PackageSchema` deliberately
omits it, `DELETE /packages/:id` is a hard delete, and no status route existed, so `isActive` was
write-once at create; (2) `update()` only assigned name/type/price/durationDays/services, so an edit
silently dropped description/sortOrder/isFeatured even though the schema accepted them (create
persisted them via its spread, hiding the asymmetry).

### Result
- New `PackageStatusSchema` and `packageService.setStatus(id, isActive)`; new router line between
  the PATCH and DELETE package routes. `isActive` stays out of `PackageSchema`, so an ordinary edit
  still cannot flip it — retiring remains a distinct action.
- `update()` now assigns description/sortOrder/isFeatured; `isActive` is still untouched there.
- `test/packages.test.ts` gains an edit round-trip (would have failed before the fix) and a
  retire→public-hidden→restore→public-visible toggle. No migration: `is_active`, `description`,
  `sort_order` and `is_featured` already exist on the entity and in `1840000000000-PackageVisibility`.
- Not yet exercised by `npm run smoke` (not run in this environment); verify there before release.

## 2026-10-20

### Decision
One error-and-tracing contract for the whole API. Every non-2xx response is the envelope
`{ success:false, error:{ code, message, details?, requestId } }`, with a stable string
`code`, an English developer-facing `message`, Zod per-field `details`, and a `requestId`.
`AppError(code, httpStatus, message, details?)` is the canonical error type; `HttpError`
is kept as a subclass whose code is derived from the HTTP status.

### Why
- Failures left the API in at least five shapes, several bypassing the central handler
  (`validate`, `authenticate`, `authorize`, the two rate limiters, one agent route), and
  unmatched `/api` routes returned Express's HTML 404. The HTTP status doubled as the only
  machine-readable signal, so a frontend could not tell `DOCUMENT_LOCKED` from any other 409
  and had no id to tie a user-facing failure to a server log.
- Making `HttpError` a status-derived subclass of `AppError` is the lever that kept this to a
  reviewable change: the ~115 existing `new HttpError(status, msg)` sites across 20 files
  needed no edit and still emit sensible codes; only a handful of business sites were upgraded
  to explicit codes (`INVALID_STATUS_TRANSITION`, `NOTE_REQUIRED`, `FILE_TOO_LARGE`,
  `FILE_TYPE_NOT_ALLOWED`).
- `requestId` is accepted from a sanitised inbound `x-request-id` (token-checked to stop log
  forging) or generated, returned in the response header, and written on every error log line
  and the morgan access log. Full per-line request context in services is deferred.
- No business logic, status set, or schema changed. Messages stay English and dev-facing;
  localisation is the frontend's job, keyed off `code` — a later i18n task.

### Result
- New: `middleware/request-id.ts`, `test/error-envelope.test.ts`, `docs/error-codes.md`.
  Rewritten: `middleware/errorHandler.ts`, `utils/http-error.ts`. `validate`, `authenticate`,
  `authorize`, `app.ts` (request-id mounted first, rate-limiter envelope handler, `/api` 404
  catch-all) now route every failure through the one handler. Dead `errorResponse()` removed.
- Stack traces and SQL never reach the body in any environment; the stack goes to the log
  under the `requestId`.
- Both frontend API clients (`admin-frontend`, `customer-portal` `src/lib/api.ts`) consume the
  nested shape and expose `code`/`requestId` on `ApiError`; this was a breaking change to the
  old `{ success:false, error:<string>, code:<number> }` shape, taken deliberately.
- Verified: API `typecheck`/`typecheck:test` clean, Jest 19 suites / 204 tests green; both
  frontends tsc + lint + vitest green. `npm run smoke` against Docker Postgres and the
  `NODE_ENV=production` no-leak check are the remaining release gate.

## 2026-10-20 — Category layer for services and packages

### Decision
A new `categories` table (flat, bilingual) that every service and every package must
reference exactly once (PROJECT-BRIEF §10.1). `services.category_id` and `packages.category_id`
are `NOT NULL`, FK `ON DELETE RESTRICT`. Admin creates a category before a service/package can
reference it; the public site filters by category and shows it on each card.

### Why
- The brief requires it, and it is the taxonomy the public website's navigation/cards need.
- It is kept **separate from the existing `catalog_categories`**, which is the generic,
  hierarchical, single-language CMS taxonomy under `modules/catalog`. That one is a different
  system (its own entities, routes, and no link to the real `services`/`packages`); conflating
  them would have coupled the public catalogue to the CMS. The names are deliberately adjacent —
  `categories` is the one services/packages key off.
- Bilingual copy (`name_en`, `name_es`, `description_en`, `description_es`) was added to
  `services` and `packages` at the same time (the brief, §1 and §7.1, requires bilingual
  DB-managed content). The existing `name`/`description` columns were **kept** as the canonical,
  unique admin key rather than replaced: `name`'s unique index, the `package_services` join and
  quotation line-item labels all read `name`, so replacing it would have been a far larger,
  riskier change for no functional gain. The public endpoints resolve `name`/`description` to one
  language via `Accept-Language` (es-MX default, en fallback); admin responses expose both.

### Result
- New: `modules/categories/` (entity/schema/service/router), migration
  `1860000000000-Categories`, `utils/i18n.ts`, `test/categories.test.ts`. Admin CRUD at
  `/api/admin/categories` (list/get/create/update, `/reorder`, `/:id/status`, delete). Public
  `GET /api/public/categories` (active + counts); `/public/services` and `/public/packages` take
  `?category=<slug>` and embed the category object, localized.
- Migration runs on a populated DB: it adds columns nullable, inserts a default **General**
  category, backfills every existing row (`category_id` = General, `_en` from the current value,
  `_es` from `_en`), then sets `NOT NULL`. Reversible. The services/packages statements are
  written per table (not a loop) so the drift tooling can attribute each column to its table.
- New error codes: `CATEGORY_NOT_FOUND` (400) and `CATEGORY_INACTIVE` (400) at the
  service/package guard; `CATEGORY_NOT_EMPTY` (409) moved from reserved to active on category
  delete. A duplicate slug is `CONFLICT`.
- Seed now seeds categories and assigns them; the first demo service's unconditional create
  (which broke a second `npm run db:seed`) was fixed to find-or-create, so the seed is idempotent.
- Verified against real Postgres: migration applied on the existing seeded DB (12 services
  backfilled, 0 null `category_id`), `npm run db:seed` twice both exit 0, `npm run smoke`
  20 passed / 0 failed (adds a category step and a `?category` filter assertion), Jest 20 suites /
  216 tests green, API + worker typecheck clean, and the drift extractor reports `categories` as a
  tracked entity with no breaking finding (17 findings, the known-clean baseline composition).

## 2026-10-23 — Document version pipeline, official files, required-documents checklist

### Decision
- The document workflow is **version-based**. A document owns many `document_versions`
  (`kind`: `customer` | `staff_on_behalf` | `official`); `documents.current_version_id` points at
  the latest ready customer/staff submission. Official (government-approved) files are their own
  `official` rows and **never overwrite** a customer version, so the full submission history
  survives (brief §7.5, §10.6).
- Uploads are **two-step**: an *intent* is issued (`POST /documents/upload-url` for the first
  version, `POST /documents/:id/versions/upload-intent` for later ones) returning a presigned S3
  **POST** — `createPresignedPost` with `content-length-range` 1–25 MB and an exact `Content-Type`,
  which a presigned PUT cannot enforce — or a local URL; the client then PUTs the bytes and calls
  `confirm`, which HEADs the object, re-checks size + allow-list + **magic bytes**, and only then
  marks the version ready, applies the role transition, writes history and queues the email, all in
  one transaction. Unconfirmed intents expire after 15 min (`UPLOAD_EXPIRED`).
- New status `submitted_to_government` (the single status change the client approved, 2026-10-16):
  `approved → submitted_to_government`, and the official-file upload moves it back to `approved`.
  Statuses and per-role transitions live only in `document-status.ts` and are served at
  `GET /api/documents/statuses`; no frontend hardcodes them.
- Upload is open to the **customer and staff** (agent/manager scoped to assigned customers);
  staff may upload `staff_on_behalf` or `official`. A customer may add a version only while
  `pending` or `rejected` (resubmission moves `rejected → pending`); otherwise `DOCUMENT_LOCKED`.
  Entitlement is gated by `canUploadDocuments(...)` (returns `true` for now, brief §10.4).

### Why
- The 2026-10-19 audit found the core flow broken live at three points (R56/R57/R58/R61, S-2/S-9):
  `approved-upload` bypassed the state machine, wrote no history/email, and wrote to local disk
  while downloads presigned S3 (customer 404); the presigned upload accepted any type and size; a
  customer could overwrite a file in any status. The version model + two-step confirm closes all of
  them in one place and keeps history immutable.

### Result
- New: `document-version.entity.ts`, `service-required-document.entity.ts`, `requirement.service.ts`
  / `requirement.schema.ts`, `entitlement.ts`, `upload-constraints.ts`, `utils/magic-bytes.ts`,
  migration `1870000000000-DocumentVersions` (both tables + `documents.current_version_id` /
  `requirement_id` + the `submitted_to_government` enum value; backfills a `customer` — and
  `official` where present — version per existing document; literal per-table DDL).
- Wired this task: admin requirement CRUD under `/api/admin/services/:serviceId/requirements` and
  `/api/admin/requirements/:id`; the customer checklist `GET /api/customers/me/checklist`
  (purchased services → requirements, submitted state, status, completion %).
- Error codes `DOCUMENT_LOCKED`, `NOT_ENTITLED`, `UPLOAD_EXPIRED`, `UPLOAD_INCOMPLETE` moved from
  "reserved" to live throw sites (`docs/error-codes.md`).
- `npm run smoke` story 7 rewritten to drive the real flow against Postgres in **S3 mode**:
  customer upload (presigned POST) → reject with note → resubmit new version → approve → submit to
  government → staff official upload → customer downloads the official file (HTTP 200, bytes match)
  → checklist 100%; plus negatives (wrong type, 26 MB, replace-while-locked, unassigned agent,
  customer-A-vs-B IDOR). New pure-logic unit tests in `test/document-pipeline.test.ts`.

## 2026-10-24 — Account approval, manager assignment, onboarding, document phases, analytics

### Decision
- **Account approval** (§11.1): `users.account_status` (`pending_approval | approved | suspended`,
  DB default `approved`) with `preferred_locale` (`en | es-MX`, default `es-MX`). Self-registration
  sets `pending_approval`; everything else (staff, backfilled rows) is `approved`. A gate
  (`middleware/account-status.ts`) blocks pending/suspended **customers** from the portal, exempting
  `GET /customers/me` and the onboarding routes; it reads the status off the cached session (no extra
  query) so `account_status` was added to `SessionState`.
- **Manager assignment** (§11.2): a dedicated `customer_manager_assignments` (UNIQUE `customer_id`
  = one manager at a time) + append-only `customer_manager_assignment_log`, managed by new methods on
  the existing `assignment.service.ts`. The agent `agent_customer_assignments` table (many-to-many,
  agent-role) was **left untouched** rather than generalised — different cardinality and role, and a
  rename would have rewritten every agent-scoping call site.
- **Phase status stored as `varchar(20)`**, not a Postgres enum: §10.3 says statuses will change after
  the first delivery, and a varchar avoids an enum ALTER each time. Transitions live in one module
  (`phase-status.ts`), exposed via `GET /documents/phases/statuses`.
- **`phase_result` version kind** is staff-internal (not customer-downloadable); completing a phase by
  uploading its result does NOT change the document's own status (unlike `official`).
- **Analytics** served at `/admin/analytics/overview` with raw SQL aggregates (no N+1), a date-range
  param, and a 60s Redis cache. The legacy bare `/admin/analytics` stub was kept.

### Why
- One manager per customer with a logged history is a poor fit for the many-to-many agent table;
  narrowing a unique constraint onto live agent rows is riskier than a new table (and this repo's
  top risk is schema drift). A separate table keeps both models honest.
- Phase emails must reach the **onboarding** `notification_emails` (not the login address) in the
  customer's locale, which the injected `notify()` cannot express (single login recipient, no locale).
  Added `notifyPhase` / `notifyAccountApproved` that resolve recipients + locale and enqueue per address.

### Result
- Entities: `account_status`/`preferred_locale` on `users`; new `customer_profiles`,
  `customer_manager_assignments`, `customer_manager_assignment_log`, `document_phases`,
  `document_phase_history`; `documents.target_date`; `document_versions.kind` gains `phase_result`.
- Migrations (literal per-table DDL, nullable→backfill→NOT NULL): `1890000000000-AccountStatus`,
  `1900000000000-CustomerProfiles`, `1910000000000-ManagerAssignments`, `1920000000000-DocumentPhases`.
- API: onboarding (`/customers/me/onboarding`), admin customer lifecycle + reassignment
  (`/admin/customers/*`), analytics (`/admin/analytics/overview`), manager workspace
  (`/manager/customers*`), and phase management under `/documents/:id/phases*`.
- Emails: worker resolves `<template>.<locale>.hbs` with a shared `_layout.hbs` partial; new
  `phase-completed`, `phase-rejected`, `account-approved` templates in EN + es-MX.
- Error codes `ACCOUNT_PENDING`, `ACCOUNT_SUSPENDED`, `MANAGER_REQUIRED`, `PHASE_INVALID_TRANSITION`
  added with live throw sites; `ONBOARDING_INCOMPLETE` reserved (`docs/error-codes.md`).
- `npm run smoke` extended (stories 9–12): register → blocked (`ACCOUNT_PENDING`) → approve-without-
  manager refused (`MANAGER_REQUIRED`) → approve with manager → onboarding saved → 3 phases → phase-1
  result upload (progress 33%) → customer sees phases → illegal transition refused → manager workspace
  → analytics overview. New unit tests in `test/document-phases.test.ts`.

## 2026-10-24 — Admin list persona/city + managers-with-counts (read-only, for the admin UI)

### Context
Building the admin/manager portal (admin-frontend). The Customers table needs a persona badge and
city per row, and the approve/reassign manager picker needs each manager's current customer count.
The signed task said "no backend change"; the user explicitly approved a **small read-only** addition
for these two gaps (no writes, no schema change).

### Decision
- `GET /api/admin/customers` serializer now also returns `persona` + `city`, read from the existing
  `customer_profiles` for the page's rows in one batched `In(...)` query (no N+1). Null until onboarded.
- New `GET /api/admin/managers` → `{ id, name, email, customerCount }[]` from one grouped aggregate
  (`users LEFT JOIN customer_manager_assignments`), admin-only, active managers only.

### Not done (flagged)
- No endpoint sets the document-wide `documents.target_date`; the admin/manager UI renders it read-only.
  Adding a setter is a write and was left out of this read-only scope.

## 2026-10-24 — Customer read additions for the portal (phases dashboard + result downloads)

### Context
Building the customer portal (customer-portal). The dashboard needs the customer's assigned manager and
per-document phase progress/target-date/service for the "documents grouped by service" view, and the
document page needs to show/download per-phase result files. These are reads the customer endpoints did
not expose; the user approved a small read-only addition (no writes, no schema change).

### Decision
- `GET /api/customers/me/dashboard` returns `manager {id,name,email}|null` (via `assignmentService.getManagerFor`).
- `GET /api/customers/me/documents` enriches each document with `service {id,nameEn,nameEs}`, `progress`,
  `phaseStatuses[]`, `targetDate`, `nextTargetDate` — built from two batched `In(...)` queries (no N+1).
- The owning customer may now download `phase_result` versions (previously staff-internal) in addition to the
  official approved file; `staff_on_behalf` uploads remain hidden. Enforced in `document.service`
  (`listVersions`, `getVersionDownloadTarget`, `getVersionForDownload`) via one `customerMayDownload` helper.

### Not changed
- API auth stays Bearer/sessionStorage; the portal adds only a non-HttpOnly presence-flag cookie for the
  Next middleware route guard (no token in the cookie, no switch to cookie auth).

## 2026-10-25 — Public-site SEO, brand rename cleanup, and i18n approach

### Context
Autopilot work across the three colocated repos (backend, admin-frontend, customer-portal). Owner priorities:
professional public website + SEO first, full bilingual, demo data with an `is_demo` column, editable
calculator + CMS. Phase 0 discovery recorded in `docs/phase0-discovery.md`; client facts in `docs/CLIENT-FACTS.md`.

### Decisions
- **Brand (W8):** removed the last user-facing "ConstDoc" strings — `apps/api/src/utils/quotation-pdf.ts`
  (PDF heading → "Grupo G2H · Servicios Integrales"), `apps/worker/src/crons/renewal.cron.ts` (email subject),
  and `customer-portal` contact page email (→ `contacto@grupog2h.com`, the confirmed brand domain).
  Identifiers (package/db/docker names, storage keys, `constdoc.*` cookies, path aliases) were deliberately
  left unchanged.
- **i18n:** the customer-portal already ships a working cookie-based locale system (`src/lib/locale.ts`,
  `messages.ts`, `locale-toggle`). We extend that for full bilingual content rather than migrate to
  `next-intl` — swapping i18n frameworks on a running app is high-risk for no user-visible gain. Full-page
  string extraction continues within this system.
- **SEO (customer-portal):** added `app/sitemap.ts` (static routes + live service/package slugs, fails soft
  to static when the API is down), `app/robots.ts` (portal/onboarding/auth disallowed), `app/manifest.ts`,
  site-wide schema.org JSON-LD (`components/seo/json-ld.tsx`), `metadataBase` + OpenGraph/Twitter + canonicals,
  and real per-page titles/descriptions. Base URL from `NEXT_PUBLIC_SITE_URL` (default `https://grupog2h.com`).
- **Structured data is Organization + WebSite only.** No `LocalBusiness` address/phone, no founding date,
  no ratings — those facts are unconfirmed (R3). Upgrade to `LocalBusiness` once the client confirms address.
- **hreflang:** the cookie-based locale serves one URL per page, so per-locale `alternates.languages` are
  intentionally omitted. Proper hreflang needs path-based locales (`/en`, `/es-MX`) — a separate, larger change.

### Verified
- `customer-portal`: `npx tsc --noEmit` → clean.
- `apps/api` and `apps/worker`: `tsc --noEmit` → clean.

## 2026-10-25 — W1 demo data + `is_demo` flag (migration 1930000000000)

### Context
Owner wants every portal testable with realistic data and a one-command teardown; chose an `is_demo`
column + migration over a naming convention. Data model mapped with Graphify (clean baseline: 31 entities,
17 advisory/untracked findings, no breaking drift).

### Decisions
- **`is_demo boolean NOT NULL DEFAULT false`** added to 11 "root" tables (users, categories, services,
  packages, documents, quotations, invoices, payments, subscriptions, agent_customer_assignments,
  customer_manager_assignments) via `1930000000000-AddIsDemoFlag` (literal ALTERs). The column is on both
  the entity and the migration for every one of the 11 — drift check re-run after: still 17 findings, no new/breaking.
- **Child/history/join rows carry no flag** (document_versions, document_phases, *_history, quotation_items,
  customer_profiles, service_required_documents, refresh_tokens, notifications_log, package_services) — they are
  purged through their parent's FK. A demo child only ever references a demo parent, so non-demo data is never touched.
- **`scripts/seed-demo.ts`** — idempotent (found-or-created on natural keys; two runs → identical counts),
  refuses production unless `ALLOW_DEMO_SEED=true`. **`scripts/purge-demo.ts`** — one transaction, FK-safe order.
  npm scripts `db:seed:demo` / `db:purge:demo`. Credentials in `docs/DEMO-ACCOUNTS.md`.
- Demo accounts: `.test` login domain + `@example.test` notification emails (never deliverable).

### Verified (this session, against real Postgres in Docker)
- `tsc --noEmit` clean. Migration ran; API restarted; `/health/ready` ok; category query selects `is_demo`.
- Seed twice → identical counts (9 users, 5 cat, 7 svc, 2 pkg, 6 docs, 3 quot, 4 inv, 2 pay, 2 subs).
- Demo revenue: paid invoices = payments = **$55,448 MXN**; non-demo users intact (20).
- Purge → all demo counts 0, non-demo intact, no FK errors; re-seed restores. Demo admin + customer login → 200.

### Flagged
- `/api/admin/analytics` is a **stub** (`"not implemented"`) — demo revenue is in the DB but needs the
  analytics aggregation endpoint built before it shows in a dashboard. Separate task.

## 2026-10-25 — W3: Admin estimation calculator UI (admin-frontend)

**Decision.** Built a single `/admin/calculator` ("Calculator & pricing") page instead of three
thin pages. It consolidates the DB-driven pricing rules the public calculator reads —
worker ranges, locations (multiplier + city fee), industries (price weight) and quote settings
(validity days, payment terms, currency) — into tabs, with a sticky **live estimate** panel that
POSTs to the existing `/api/public/quotations/calculate` and recomputes whenever a rule is edited.

- New files: `src/components/pricing/rule-crud.tsx` (generic list+create+edit+deactivate over a
  rule endpoint; form values are strings, parent `toBody` does the Number()/null conversion so a
  blank numeric input is never `NaN`) and `src/app/(admin)/admin/calculator/page.tsx`.
- Nav: replaced the three `ready:false` stubs (Industries / Worker ranges / Locations) with one
  `ready:true` "Calculator & pricing" entry. No nav test referenced the old labels.
- Reuses existing backend endpoints only (admin pricing CRUD + public calculate); no backend change.
- Verified: `tsc --noEmit` clean, `eslint` clean, and live against the running stack —
  Construction + CDMX + 10 workers + 2 services → $54,750 MXN, matching the engine formula
  (worker base × location multiplier × industry weight + service charges + city fee).
- Not yet run: `npm run build` (admin dev server holds `.next`; build needs dev stopped).

## 2026-10-25 — Admin dashboard KPIs (admin-frontend)

**Decision.** Replaced the static `/admin` welcome with an at-a-glance KPI summary that reads the
**real** `GET /admin/analytics/overview` (last 30 days). Tiles: revenue (MXN), customers (+approved),
pending approvals, documents in review; plus a "documents waiting per manager" list, new-customers
count, and quick links. Subscriptions deliberately omitted — `/admin/subscriptions` and the bare
`/admin/analytics` are stubs and the rules forbid building UI on stubs. Full charts remain on
`/admin/analytics`. Verified: `tsc` + `eslint` clean; live screenshot shows real demo data
($747,348 revenue, 18 customers, per-manager workload). `npm run build` not run (dev holds `.next`).

## 2026-10-25 — Announcement / offer bar (backend + admin + portal)

**Decision.** Added an admin-toggled announcement bar above the public navbar, driven by
`app_settings` (no migration — key/value JSONB table already exists). New setting keys:
`offer_bar_enabled` (bool), `offer_bar_text_en`, `offer_bar_text_es`, `offer_bar_link`, added to the
settings allowlist and discriminated-union validator in `admin-pricing.schema.ts`.

- Backend: new public read `GET /api/public/site-config` → `{ offerBar: { enabled, textEn, textEs,
  link } }` (`publicService.siteConfig`, reusing the existing `getSettingValue` helper). No auth.
- Admin: an "Announcement bar" card on `/admin/settings` (enable toggle + bilingual message + link),
  saved via the existing `PUT /admin/settings/:key`. Enabling is blocked until both languages are set.
- Portal: `OfferBar` component rendered at the top of `PublicHeader` (not sticky, so it scrolls away
  while the nav stays pinned); locale-aware, links to a path or absolute URL, hidden when disabled.
- Verified: backend `typecheck` clean; `npm run smoke` = 48 passed / 0 failed / 2 pre-existing skips
  (no regression); live round-trip (admin PUT → `/public/site-config` → bar visible on the home page);
  invalid boolean rejected with 400. Both frontends `tsc` clean.
