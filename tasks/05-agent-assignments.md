<!-- Task spec for an unattended Claude Code run. Source: docs/build-audit-2026-10-14.md
     Read tasks/RUNNER-RULES.md first; it overrides anything here that conflicts. -->

# 05 — agent_customer_assignments: entity, migration, service
**Branch** `agent/agent-assignments` · **Base** `feat/admin-documents-notifications` · **Deps** none · **Changes persistence** **YES — smoke mandatory** · **Assigned migration timestamp 1850000000000**

**Goal.** No assignment concept exists anywhere — zero matches for `assign` outside comments. This blocks the entire agent/manager portal and is a **live data-exposure gap**: `assertCanReadDocument` returns early for any staff role with a `// TODO(phase-4)`, so every agent can read every customer's documents.

**This task lays the foundation only — no router, no mounting, no scoping change.** Those are deliberately separate so an unattended run cannot accidentally change who can see what.

**Decided design: many-to-many, `UNIQUE (agent_id, customer_id)`.** A customer may have several agents; an agent many customers. This is the permissive option on purpose — client decision **C6** is unanswered, and narrowing a constraint later is a simpler migration than widening one after real rows exist. One-agent-per-customer can be enforced by convention on top of this schema.

**Files to read first**
- `docs/build-audit-2026-10-14.md` — §4.3, deviation **D16**, client blocker **C6**, §8 Wave 2 task 6
- `docs/client-decisions.md` — "Manager assignments and oversight", all four questions unanswered
- `docs/postgres-and-typeorm-guide.md`
- `apps/api/src/entities/refresh-token.entity.ts` — simplest entity with a user FK, `@Index()` and `AppBaseEntity`
- `apps/api/src/entities/quotation-item.entity.ts` — the `@Unique([...])` composite pattern
- `apps/api/src/entities/base.entity.ts` — `AppBaseEntity` gives `id`, `created_at`, `updated_at`
- `apps/api/src/migrations/1830000000000-FixSchemaDrift.ts` — house style
- `apps/api/src/entities/index.ts` — the barrel every entity is exported from
- `apps/api/src/config/database.ts:43-67` — **`entities:` is an explicit array, not a glob.** A new entity must be added here too or TypeORM will not know about it. `migrations:` *is* a glob and needs nothing.
- `apps/api/src/modules/admin/admin-user.service.ts` — how a service validates a user exists with the expected role
- `apps/api/test/support/database.fake.ts:109-123` — the `fakeDb` accessor map

**Files allowed to change.** `apps/api/src/entities/agent-customer-assignment.entity.ts` **(new)** · `apps/api/src/entities/index.ts` (one export line) · `apps/api/src/config/database.ts` (one import + one `entities:` entry) · `apps/api/src/migrations/1850000000000-AgentCustomerAssignments.ts` **(new)** · `apps/api/src/modules/assignments/assignment.service.ts` **(new)** · `apps/api/test/support/database.fake.ts` (one `fakeDb` accessor) · `apps/api/test/assignments.test.ts` **(new)**

**Files forbidden.** `apps/api/src/app.ts` — **no mounting in this task** · `document.service.ts` — **do not change `assertCanReadDocument`; the scoping change is a separate task** · `agent.router.ts`, `admin.router.ts`, `customer.router.ts` — no routes · every existing file in `src/migrations/` · the global forbidden list.

**What to do**
1. `AgentCustomerAssignmentEntity`, table `agent_customer_assignments`, extending `AppBaseEntity`: `agentId` → `agent_id` uuid, `@Index()`, FK `users(id)` ON DELETE CASCADE · `customerId` → `customer_id` uuid, `@Index()`, FK `users(id)` ON DELETE CASCADE · `assignedBy` → `assigned_by` uuid **nullable**, FK `users(id)` ON DELETE SET NULL (keep the record when the assigner is deleted) · `note` text nullable · `@Unique(["agentId", "customerId"])`. **No `UserEntity` relation properties** — the repo rule is that no response may embed a raw `UserEntity`, and omitting the relations makes that impossible to get wrong. Join explicitly when a later task needs names.
2. Migration `1850000000000-AgentCustomerAssignments`, class `AgentCustomerAssignments1850000000000`: `CREATE TABLE IF NOT EXISTS "agent_customer_assignments"` — **acceptable here because the table is genuinely new**; the no-op warning applies to correcting tables an earlier migration created, which this is not · `uuid_generate_v4()` default on `id` (`uuid-ossp` is installed by `docker/postgres/init.sql`) · the three FK constraints, each `DROP CONSTRAINT IF EXISTS` then `ADD`, matching the entity's cascades exactly · `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_agent_customer_assignments_pair" ON "agent_customer_assignments" ("agent_id", "customer_id")` · the two single-column indexes · `down()` drops the table.
3. `assignmentService`, **no HTTP surface**: `assign({ agentId, customerId, assignedBy, note? })` verifies the agent exists with role `agent` and the customer with role `customer`, then upserts — **idempotent**: an existing pair updates `note`/`assignedBy` without throwing or duplicating; 404 if either user is missing, 400 if either has the wrong role · `unassign(agentId, customerId)` returns `{ deleted: boolean }`, never throws on a missing pair · `listForAgent(agentId)` · `listForCustomer(customerId)` · `isAssigned(agentId, customerId)` → boolean, **the function the follow-up scoping task will call from `assertCanReadDocument`** — give it a doc comment saying exactly that. Use `find`/`findOne`/`count` only; `createQueryBuilder()` throws.
4. Register the entity in **both** `src/entities/index.ts` and the `entities:` array in `src/config/database.ts`. Add `assignments:` to `fakeDb`.

**Acceptance criteria (command-verifiable)**
1. `grep -n "AgentCustomerAssignmentEntity" apps/api/src/entities/index.ts apps/api/src/config/database.ts` → at least one match in **each** file
2. `docker compose exec api npm run db:migrate` → `db:revert` → `db:migrate`, all exit 0
3. `docker compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "\d agent_customer_assignments"` shows the unique index on `(agent_id, customer_id)` and three FKs
4. **`npm run smoke` exits 0**, SKIP list unchanged from the audit's four
5. **Nothing about access changed** — the safety criterion: `git diff --name-only feat/admin-documents-notifications -- apps/api/src/app.ts apps/api/src/modules/documents/ apps/api/src/modules/agent/` → **no output**
6. `grep -rn "assignment" apps/api/src/app.ts` → **no output**
7. The duplicate-assign path is idempotent, not an error — test
8. `grep -n "UserEntity" apps/api/src/entities/agent-customer-assignment.entity.ts` → **no output**

**Tests to add** — `apps/api/test/assignments.test.ts`, service-level (no HTTP, there is no router yet): `assign()` creates a row and `isAssigned()` then true · `assign()` twice on the same pair → still one row, `note` updated, no throw · **the same customer assigned to two agents succeeds** (assert the many-to-many decision explicitly) · the same agent assigned many customers succeeds · non-existent agent → 404, non-existent customer → 404 · an "agent" id that is really a customer → 400, a "customer" id that is an admin → 400 · `unassign()` removes the row and `isAssigned()` then false · `unassign()` on a never-assigned pair → `{ deleted: false }`, no throw · `listForAgent`/`listForCustomer` return the right ids and leak no other user's · `isAssigned()` false for an unrelated pair. Use `seedUser({ role: ... })`, `resetTestState()` and the new `fakeDb.assignments()`.

**Verification.** `cd apps/api && npm run typecheck && npm run typecheck:test && npm test` (expect ≥ 132) then **mandatory**: `docker compose up -d && docker compose exec api npm run db:migrate && docker compose restart api && npm run smoke`. If Docker is unavailable the task is **NOT complete**: write `tasks/blockers/agent-assignments.md` and say so in the commit body.

**Do not do.** **Mount anything** — no `/api/manager`, no router, no `app.ts` change; that is the next task and it changes who can see what · **touch `assertCanReadDocument`** — narrowing agent visibility is a separate reviewed change, and an unattended run must not alter authorisation · add a `UserEntity` relation to the new entity · edit any existing migration, or use a timestamp other than `1850000000000` (task 02 owns `1840000000000`) · seed assignment rows in `seed-phase0.ts` · implement `assignments/bulk` or a workload report · add `is_primary` or any field beyond the five specified — C6 is still open with the client, and inventing schema against an open question is exactly what rule 17 forbids · use `createQueryBuilder` · trust `npm test` alone.
