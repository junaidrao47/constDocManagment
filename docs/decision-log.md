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




