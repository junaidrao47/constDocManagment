@AGENT.md

## Commands (run from `apps/api` unless noted)
- Checks: `npm run typecheck && npm run typecheck:test && npm test` (there is no lint script)
- Infra is faked in tests via `moduleNameMapper` in `apps/api/jest.config.js` (database, redis, email, email-queue). Patterns match the import string, not the resolved path. New infra modules need a fake there, or Jest won't exit.
- Assert queued emails with `queuedEmails` from `test/support/email-queue.fake.ts`.
- Worker typecheck: `cd apps/worker && npx tsc --noEmit -p .`
- Full stack: `docker compose up --build` (repo root), then `GET http://localhost:3001/health/ready`.
- Demo data: `npm run db:seed` (logins in `src/scripts/seed-phase0.ts`).

## Gotchas
- Currency is **MXN** (client is Mexican). Never change it.
- Never return a `UserEntity` (or a relation holding one) in a response; it carries `passwordHash`.
- Status-change emails go through `modules/notifications/notify.service.ts` → BullMQ `email` queue → worker templates in `apps/worker/src/templates/`.
- Email templates link to `/portal/...` but the customer portal routes are `/dashboard/...` (open bug, fix planned in E4).
- `GET /api/admin/subscriptions` and `GET /api/admin/analytics` are stubs. Don't build UI on them.
