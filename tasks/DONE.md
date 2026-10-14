# Completed tasks

One entry per task, appended by the runner. Do not edit by hand except to add
review notes.

Format:

```
## <task id> — <branch> — <commit sha>
Verification commands run: <list>
Smoke: run / not run (and why)
For a human to look at: <anything>
```

---

## 01-web-url - agent/web-url - ec4206d
Verification commands run: typecheck (0), typecheck:test (0), npm test (12 files
/ 125 tests, up from 120), worker npx tsc --noEmit -p . (0). All 6 acceptance
criteria re-run and passing.
Smoke: not required - no schema change. (Later confirmed green on other branches.)
For a human to look at: acceptance criterion 1 (`grep process.env.WEB_URL`) first
tripped on a doc comment I had written containing the literal string. I reworded
the comment rather than weaken the check, so the grep stays a useful guard.

## 02-packages-flags - agent/packages-flags - e99be79
Verification commands run: typecheck (0), typecheck:test (0), npm test (12 files
/ 126 tests). Migration applied, reverted (all four columns dropped), re-applied
against real Postgres; \d packages confirms the columns, defaults and
IDX_packages_is_active.
Smoke: RUN AND PASSING - 17 passed, 0 failed, 4 not built yet, matching the four
SKIPs recorded in docs/build-audit-2026-10-14.md.
For a human to look at: TWO changes beyond the spec, both inside allowed files
and both called out in the commit body. (1) resolveServices() moved off the
deprecated findByIds to find({ id: In(...) }) - the fake repository implements no
findByIds, so the create path could not be exercised at all. (2) create() now
sets isActive explicitly instead of relying on the column default, because the
fake's create() does not apply entity defaults. Both are defensible on their own
merits, but they are scope the spec did not ask for.

## 03-paginate-quotations - agent/paginate-quotations - c606786
Verification commands run: typecheck (0), typecheck:test (0), npm test (12 files
/ 133 tests). Criteria 7 and 8 (no query builder; the three existing paginated
services untouched) both pass.
Smoke: not required - no schema change.
For a human to look at: acceptance criteria 1-3 are written as curl commands and
could not be run (no live API at the time). The same three behaviours - bare
array with no params, wrapped with ?page, limit as an alias - are asserted by
tests instead. Worth re-running the curl form once the stack is up.

## 04-document-history - agent/document-history - 5a2c3da
Verification commands run: typecheck (0), typecheck:test (0), npm test (12 files
/ 130 tests). assertCanReadDocument call count rose by exactly 1; no migration
or entity touched.
Smoke: not required - read-only over existing data.
For a human to look at: nothing outstanding. Note this branch and 05 both touch
test/support/database.fake.ts, so merge them in sequence.

## 05-agent-assignments - agent/agent-assignments - 230b367
Verification commands run: typecheck (0), typecheck:test (0), npm test (12 files
/ 134 tests).
Smoke: RUN AND PASSING - 17 passed, 0 failed, 4 not built yet. Plus a real
insert through the entity against Postgres (round-trip, nullable assigned_by,
and the duplicate pair correctly rejected by UQ_agent_customer_assignments_pair)
- the entity/migration agreement the fake DB structurally cannot check. Migration
applied, reverted and re-applied.
For a human to look at: THE SECURITY GAP IS STILL OPEN BY DESIGN. This task
builds the table, entity and service and deliberately does not touch
assertCanReadDocument or mount any router, so every agent can still read every
customer's documents. isAssigned() is the function the follow-up should call.
Acceptance criteria 6 and 8 appear to fail but are false positives: 6 greps for
"assignment" in app.ts and hits a PRE-EXISTING comment at line 128 (app.ts is
untouched - verified by git diff), and 8 greps for "UserEntity" in the entity and
hits my own doc comment explaining why there is no such relation. Verified
precisely instead: no UserEntity import, no relation decorators, app.ts unmodified.
