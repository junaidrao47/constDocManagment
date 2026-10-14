# Runner Rules

> ## ⚠️ BASE BRANCH = `feat/admin-documents-notifications`
>
> **Branch every task from `feat/admin-documents-notifications`, NOT from `main`.**
>
> `main` is **10 commits behind** and does not contain: `apps/api/src/scripts/smoke.ts` (so
> `npm run smoke` does not exist there), `modules/payments/invoice.service.ts`,
> `modules/notifications/notify.service.ts`, `utils/serialize-user.ts`, or migrations
> `1820000000000-DocumentApprovedUpload` and `1830000000000-FixSchemaDrift`. It has 6 test files,
> not 11, and its latest migration is `1780000000000`.
>
> Branching from `main` makes **every one of the five tasks** fail its "Files to read first" check
> and halt under rule 18. The 120-test floor and the `1840`/`1850` migration timestamps are both
> computed against `feat/admin-documents-notifications`.
>
> If this base branch has since been merged to `main`, change this banner and rule 2 to say `main`
> and verify `git cat-file -e main:apps/api/src/scripts/smoke.ts` succeeds first.

Read this before every task. It overrides anything in a task spec that contradicts it. These rules exist because you are running unattended: nobody will catch a mistake before morning.

## Git
1. **Never commit to `main`. Never check out `main` to work on it.**
2. One branch per task, branched from **`feat/admin-documents-notifications`** (the BASE BRANCH — see the banner above, **not** `main`):
   `git checkout feat/admin-documents-notifications && git checkout -b agent/<task-slug>`
   The slug is in the spec header. Do **not** pull or fetch — work from the local base as it is.
3. **Never push.** No `git push`, no force, no remote writes, no PR creation. Branches stay local for human review.
4. Commit only files in that task's `Files allowed to change`. Run `git status --porcelain` first and abort if anything else is modified.
5. Never `git add -A` or `git add .`. Add each path explicitly.
6. Never amend, rebase, `reset --hard`, revert, or force anything.
7. Conventional commit subject scoped to the module, e.g. `fix(config): read WEB_URL through validated env`.
8. End the commit message with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Secrets
9. **Never commit a secret.** `.env` is forbidden to read, write or stage — it is gitignored and must stay untracked.
10. Never print, log, echo or copy the value of any variable from `.env`. Names are fine; values are not. This includes into a blocker file.
11. `.env.example` may only receive an empty or clearly-placeholder value (e.g. `WEB_URL=http://localhost:3002`). Never a real credential.

## Migrations
12. **Never edit a migration that already exists.** They have run against real databases. Add a new one.
13. Use the exact timestamp the spec assigns. Do not invent one — two parallel tasks would collide.
14. `CREATE TABLE IF NOT EXISTS` is a **no-op** on an already-migrated database and cannot correct a table an earlier migration created. Use explicit `ALTER TABLE`.
15. Every migration needs a `down()` that truly reverses `up()`. If reversal would delete real data, make `down()` fail loudly instead.
16. A new entity must be registered in **both** `src/entities/index.ts` and the explicit `entities:` array in `src/config/database.ts`. That list is not a glob. Migrations *are* a glob and need no registration.

## When you are unsure — STOP
17. **If anything is ambiguous, stop and write the blocker. Do not guess.** Write `tasks/blockers/<task-slug>.md` with: what you were doing, the exact file and line, the readings you could not choose between, and what you need to be told. Commit only that file and move on.
18. Specifically stop if: a file in `Files to read first` is missing; a type error has more than one plausible fix; a test fails for a reason the spec does not predict; the task would need a forbidden file; or an acceptance criterion cannot be verified by its command.
19. Never widen scope to make something pass. Never delete or skip a failing test. Never add `@ts-expect-error`, `any`, `eslint-disable` or `it.skip` to get green.
20. Never fix something you noticed in passing. Note it in `tasks/observations.md` and leave the code alone.

## Testing — the rule that matters most here
21. `apps/api/jest.config.js` maps the data source to an **in-memory fake**. **A green `npm test` is NOT evidence that a persistence change works.** This blind spot has already shipped four production bugs while all 120 tests passed.
22. Any task touching a migration, entity or column **must** be verified with `npm run smoke` against a live API and real Postgres. If Docker is unavailable the task is **NOT complete** — write a blocker and say so in the commit body.
23. After changing any decorator (relation, cascade, column), run `docker compose restart api`. `ts-node-dev --respawn` does not rebuild entity metadata, so the change silently does nothing.
24. `FakeRepository.createQueryBuilder()` **throws**. Do not introduce a query builder in any of these tasks — use `find`/`findAndCount`.
25. New infra modules need a fake in `jest.config.js` `moduleNameMapper`, or Jest will not exit.
26. Never reduce coverage. 11 suites / 120 tests pass today; that is the floor.

## Forbidden in every task
`.env` · `compose.yml`, `compose.prod.yml`, `docker/**`, `apps/*/Dockerfile`, `.dockerignore` · `nginx/**` · `.github/**` · `package.json`, `package-lock.json` (**no new dependencies** — every task here is achievable with what is installed) · any existing file in `src/migrations/` · `../admin-frontend/**`, `../customer-portal/**` (backend repo only) · `AGENT.md`, `CLAUDE.md` · any file not named in that task's allow-list.

## Per-task completion checklist
Complete only when **all** hold:
- [ ] every acceptance criterion verified by running its stated command
- [ ] `npm run typecheck` exits 0
- [ ] `npm run typecheck:test` exits 0
- [ ] `npm test` exits 0 with **no fewer** than 120 passing tests
- [ ] `npm run smoke` run and passing, **if the task changes persistence**
- [ ] `git status --porcelain` shows only allowed paths
- [ ] one commit on `agent/<task-slug>`, not pushed
- [ ] `tasks/DONE.md` appended with task id, branch, commit sha, which verification commands ran, and anything a human should look at

If any box is unchecked, write a blocker instead of a commit.
