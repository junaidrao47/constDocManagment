@AGENT.md
- Always read @docs/PROJECT-BRIEF.md first. It is the source of truth for requirements, brand, languages and working rules.


## Commands (run from `apps/api` unless noted)
- Checks: `npm run typecheck && npm run typecheck:test && npm test` (there is no lint script)
- **`npm run smoke` is the real gate.** It drives the whole milestone story over HTTP against a running API and a real Postgres. A green `npm test` is NOT evidence that a persistence change works — see Gotchas. Needs the stack up and `npm run db:seed` done. Override the target with `SMOKE_API_URL=https://host/api`. Steps not built yet print `SKIP <phase>`, so it doubles as the delivery scoreboard.
  - `compose.yml` mounts only `apps/api/src`, not `package.json`, so inside the container run `npx ts-node src/scripts/smoke.ts` rather than `npm run smoke`.
  - Entity *metadata* is built when the DataSource boots, and `ts-node-dev --respawn` does not rebuild it. After changing a decorator (a relation, a cascade, a column), `docker compose restart api` or the change silently does nothing.
- Infra is faked in tests via `moduleNameMapper` in `apps/api/jest.config.js` (database, redis, email, email-queue). Patterns match the import string, not the resolved path. New infra modules need a fake there, or Jest won't exit.
- Assert queued emails with `queuedEmails` from `test/support/email-queue.fake.ts`.
- Worker typecheck: `cd apps/worker && npx tsc --noEmit -p .`
- Full stack: `docker compose up --build` (repo root), then `GET http://localhost:3001/health/ready`.
- Demo data: `npm run db:seed` (logins in `src/scripts/seed-phase0.ts`). Seed is additive (find-or-create); run `npm run db:reset` first for a clean Mexican-only dataset. Seeded demo users: admin/manager/agent/customer plus `customer2@test.com` and `agent2@test.com`. Locations are CDMX / Monterrey / Guadalajara.
- **Full portal demo set (W1):** `npm run db:seed:demo` / `npm run db:purge:demo` (or `docker compose exec api npx ts-node src/scripts/seed-demo.ts`). Every row is `is_demo=true`; purge removes the whole set (child rows via FK). Idempotent; refuses `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`. Accounts + password in `docs/DEMO-ACCOUNTS.md` (all `Demo1234!`, `.test` domain). Gives customers/managers/documents (all statuses)/quotations/invoices/payments (~$55k MXN revenue)/subscriptions. Note: `/admin/analytics` is still a stub, so demo revenue is in the DB but not yet on a dashboard.

## Gotchas
- Currency is **MXN** (client is Mexican). Never change it.
- Never return a `UserEntity` (or a relation holding one) in a response; it carries `passwordHash`.
- Status-change emails go through `modules/notifications/notify.service.ts` → BullMQ `email` queue → worker templates in `apps/worker/src/templates/`.
- Email templates link to `/portal/...` but the customer portal routes are `/dashboard/...` (open bug, fix planned in E4).
- `GET /api/admin/subscriptions` and `GET /api/admin/analytics` are stubs. Don't build UI on them.
- Tests run against an in-memory fake DB, so entity/schema drift is invisible to them. **This has now produced four production bugs; treat it as the top risk in this repo.** All 120 tests passed while payments could not be inserted at all, staff quotations could not be inserted at all, and `quotation_items` was empty for every quotation in existence. Verify every persistence change with `npm run smoke`, never with `npm test` alone.
- Three shapes this drift takes, all seen here: (1) a column on the entity with no migration (`documents.approved_*`); (2) a column in Postgres that is on no entity and `NOT NULL` with no default, so inserts fail (`payments.status`); (3) a relation the code populates inline but whose `@OneToMany` has no `cascade`, so TypeORM drops it without error (`QuotationEntity.items`). The fake repository hides all three.
- `CREATE TABLE IF NOT EXISTS` in a later migration is a **no-op** on an already-migrated database, so it cannot be used to correct a table InitialSchema already created. Use explicit `ALTER`. After adding an entity column, add a migration and verify against real Postgres (`docker compose exec api npm run db:migrate`). Example: the `documents.approved_*` columns existed on the entity with no migration until `1820000000000-DocumentApprovedUpload`.
- Write migration DDL with **literal table names**, not an interpolated `for (const t of [...]) ALTER TABLE "${t}"` loop. The drift tooling (and a human diffing the migration) matches the literal `ALTER TABLE "services" ADD COLUMN "x"`, so an interpolated table name reads as untracked drift even when the column really exists. Unroll the loop per table (see `1860000000000-Categories`).

## Frontend rules
- Only call endpoints that exist. Check docs/api-surface.md in the backend repo and the router files. Never build UI on stubs (/admin/subscriptions, /admin/analytics).
- One shared api client. Every page uses it. It handles auth header, 401 refresh, and error shape { success:false, error, code }.
- Every data screen has loading, empty, error, and success states. No silent catch that returns [].
- Reuse components: DataTable (pagination, sort, empty state), FormDialog, ConfirmDialog, StatusBadge, PageHeader. Build them once; never copy-paste a table.
- Forms: React Hook Form + Zod. Show server errors inline (e.g. 409 on delete, overlap on worker ranges).
- Money: MXN, formatted with Intl.NumberFormat; never hardcode a currency symbol.
- Mobile-first. Check at 375px and 1280px.
- A task ends only when: npm run lint && npx tsc --noEmit && npm run build pass.
## Token rules (always follow)
- Use the Graphify graph and Ponytail before opening files; never read whole directories.
- Read docs/PROJECT-BRIEF.md only for the sections the task names.
- Do not read docs/build-audit-*.md in full; open only the rows for the current task.
- Run targeted tests (`vitest run <file>`), not the full suite. Run the full gate (tsc, lint, test, build) once at the end of a task, with output piped through `| tail -30`.
- Run `npm run smoke` only when the backend changed, once per task.
- Do not take screenshots unless I ask. Do not write Playwright specs unless I ask.
- No subagents for small tasks. No repeated audits.
- Keep answers short: report what changed, what passed, what is left.
