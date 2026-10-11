@AGENT.md

## Commands (run from `apps/api` unless noted)
- Checks: `npm run typecheck && npm run typecheck:test && npm test` (there is no lint script)
- Infra is faked in tests via `moduleNameMapper` in `apps/api/jest.config.js` (database, redis, email, email-queue). Patterns match the import string, not the resolved path. New infra modules need a fake there, or Jest won't exit.
- Assert queued emails with `queuedEmails` from `test/support/email-queue.fake.ts`.
- Worker typecheck: `cd apps/worker && npx tsc --noEmit -p .`
- Full stack: `docker compose up --build` (repo root), then `GET http://localhost:3001/health/ready`.
- Demo data: `npm run db:seed` (logins in `src/scripts/seed-phase0.ts`). Seed is additive (find-or-create); run `npm run db:reset` first for a clean Mexican-only dataset. Seeded demo users: admin/manager/agent/customer plus `customer2@test.com` and `agent2@test.com`. Locations are CDMX / Monterrey / Guadalajara.

## Gotchas
- Currency is **MXN** (client is Mexican). Never change it.
- Never return a `UserEntity` (or a relation holding one) in a response; it carries `passwordHash`.
- Status-change emails go through `modules/notifications/notify.service.ts` → BullMQ `email` queue → worker templates in `apps/worker/src/templates/`.
- Email templates link to `/portal/...` but the customer portal routes are `/dashboard/...` (open bug, fix planned in E4).
- `GET /api/admin/subscriptions` and `GET /api/admin/analytics` are stubs. Don't build UI on them.
- Tests run against an in-memory fake DB, so entity/schema drift is invisible to them. After adding an entity column, add a migration and verify against real Postgres (`docker compose exec api npm run db:migrate`). Example: the `documents.approved_*` columns existed on the entity with no migration until `1820000000000-DocumentApprovedUpload`.
