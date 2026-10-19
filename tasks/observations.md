# Observations

Things noticed in passing that were correctly LEFT ALONE (RUNNER-RULES rule 20).
Nothing here has been fixed. Each line is a candidate for a future task.

---

- `npm run db:seed` is NOT idempotent, contrary to CLAUDE.md's claim that it is
  "additive (find-or-create)". Running it against an already-seeded database
  fails with `duplicate key value violates unique constraint "UQ_services_name"`
  (Key (name)=(Construction Compliance Review) already exists), from
  `apps/api/src/scripts/seed-phase0.ts`. The documented workaround is
  `npm run db:reset` first. Left alone per rule 20.
- Three acceptance criteria in tasks/*.md are written as greps for a bare
  identifier and false-positive on prose: `process.env.WEB_URL` (01 crit 1),
  `isActive` (02 crit 6) and `UserEntity` (05 crit 8), plus `assignment` in
  app.ts (05 crit 6) which matches a pre-existing comment. Future specs should
  scope such greps to code (for example `grep -n "^import.*UserEntity"`) rather
  than matching anywhere in the file.
- RUNNER-RULES' per-task checklist says to append to tasks/DONE.md, but DONE.md
  is in no task's "Files allowed to change" list, which rule 4 would treat as an
  unexpected modification. The ledger was therefore written on the base branch
  after the task branches were committed. Worth reconciling in the rules.
- The dev database now has migrations 1840 and 1850 recorded as applied even
  when checked out on a branch that contains only one of them. Harmless (TypeORM
  only runs pending migrations) but it means the local DB is ahead of any single
  task branch.
