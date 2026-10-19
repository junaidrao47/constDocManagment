<!-- Task spec for an unattended Claude Code run. Source: docs/build-audit-2026-10-14.md
     Read tasks/RUNNER-RULES.md first; it overrides anything here that conflicts. -->

# 02 — Package visibility fields and public filtering
**Branch** `agent/packages-flags` · **Base** `feat/admin-documents-notifications` · **Deps** none · **Changes persistence** **YES — smoke mandatory** · **Assigned migration timestamp 1840000000000**

**Goal.** `packages` has no `is_active`, so `GET /api/public/packages` returns every package including drafts and retired ones — `publicService.listPackages()` passes no `where` at all. There is also no `description`, no ordering field and no way to feature a package. Add four columns and filter the public list.

**Files to read first**
- `docs/build-audit-2026-10-14.md` — §4.5, deviation **D17**
- `docs/postgres-and-typeorm-guide.md`
- `apps/api/src/migrations/1830000000000-FixSchemaDrift.ts` — house style for an `ALTER`-based migration with a real `down()`
- `apps/api/src/migrations/1780000000000-PricingGuardrails.ts` — adding a column plus an index
- `apps/api/src/modules/packages/{package.entity.ts,package.schema.ts,package.service.ts}` — including `serializePackage`
- `apps/api/src/modules/public/public.service.ts:36-55` — `listPackages()`, the one with no `where`
- `apps/api/src/entities/industry.entity.ts` — the `is_active` + `@Index()` pattern to copy
- `apps/api/src/modules/admin/admin-pricing.service.ts` — how `deactivateService` soft-deactivates

**Files allowed to change.** `apps/api/src/migrations/1840000000000-PackageVisibility.ts` **(new)** · `package.entity.ts` · `package.schema.ts` · `package.service.ts` · `public.service.ts` · `apps/api/test/packages.test.ts` **(new)**

**Files forbidden.** Every existing file in `src/migrations/` · `admin.router.ts` (admin package routes keep current behaviour) · the global forbidden list.

**What to do**
1. Migration `1840000000000-PackageVisibility`, class `PackageVisibility1840000000000`, explicit `ALTER TABLE` (**not** `CREATE TABLE IF NOT EXISTS` — a no-op here): `is_active boolean NOT NULL DEFAULT true` · `description text NULL` · `sort_order integer NOT NULL DEFAULT 0` · `is_featured boolean NOT NULL DEFAULT false` · `CREATE INDEX IF NOT EXISTS "IDX_packages_is_active"`. `down()` drops the index then the four columns, each `IF EXISTS`. Existing rows default to active, so nothing currently visible disappears.
2. `PackageEntity`: the four properties, types and defaults matching the migration exactly, `@Index()` on `isActive` as `IndustryEntity` does.
3. `PackageSchema`: `description` (nullable, trimmed, max 2000), `sortOrder` (int ≥ 0, default 0), `isFeatured` (boolean, default false). **`isActive` is deliberately NOT settable here** — deactivation stays a separate concern, consistent with services.
4. `serializePackage`: include `description`, `isActive`, `sortOrder`, `isFeatured`.
5. `publicService.listPackages()`: add `where: { isActive: true }`, order `isFeatured: "DESC", sortOrder: "ASC", name: "ASC"`, include `description` in the output.
6. `packageService.list()` (admin) keeps returning **all** packages, same ordering. An admin must still see what they retired.

**Acceptance criteria (command-verifiable)**
1. `git diff --name-only feat/admin-documents-notifications -- apps/api/src/migrations/` → exactly the one new path
2. `docker compose exec api npm run db:migrate` → `db:revert` → `db:migrate`, all exit 0
3. `docker compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "\d packages"` shows all four columns
4. **`npm run smoke` exits 0** with the SKIP list unchanged from the audit's four
5. An inactive package is hidden from the public list and visible to admin — tests below
6. `grep -n "isActive" apps/api/src/modules/packages/package.schema.ts` → **no output**

**Tests to add** — `apps/api/test/packages.test.ts`: public list omits an `isActive: false` package · public list orders featured first, then `sortOrder`, then name · admin list **includes** the inactive one · `POST /api/admin/packages` round-trips `description`/`sortOrder`/`isFeatured` through `GET /api/admin/packages/:id` · a client-supplied `isActive` is ignored (assert the stored row is still active by default). Seed with `fakeDb.packages()` / `fakeDb.services()`; use `testApp()`, `seedUser()`, `mintToken()`, `bearer()`, `resetTestState()`.

**Verification.** `cd apps/api && npm run typecheck && npm run typecheck:test && npm test` (expect ≥ 125) then **mandatory**: `docker compose up -d && docker compose exec api npm run db:migrate && docker compose restart api && npm run smoke`. The restart matters — entity metadata is built at boot and `--respawn` does not rebuild it. If Docker is unavailable the task is **NOT complete**: write `tasks/blockers/packages-flags.md` and say so in the commit body.

**Do not do.** Edit any existing migration · use `CREATE TABLE IF NOT EXISTS` · pick a different timestamp (task 05 owns `1850000000000`) · add `isActive` to `PackageSchema` or add a deactivate route · change `DELETE /api/admin/packages/:id` from a hard delete (its subscription guard is tested behaviour) · touch `PackageEntity.services` or the `package_services` join table · change the `admin.router.ts` package routes · trust `npm test` alone — the fake DB cannot see a column that exists on the entity but not in Postgres, and that exact defect has shipped four times.
