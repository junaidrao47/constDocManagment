# tasks/ — unattended run queue

Five independent backend task specs, written 2026-10-14 from `docs/build-audit-2026-10-14.md`.

**Read `RUNNER-RULES.md` first.** It overrides anything in a spec that conflicts.

> ## ⚠️ Base branch is `feat/admin-documents-notifications`, NOT `main`
>
> `main` is 10 commits behind and lacks `smoke.ts`, `invoice.service.ts`, `notify.service.ts`,
> `serialize-user.ts` and migrations `1820`/`1830`. Branching from it halts all five tasks.
> Confirm before starting:
>
> ```bash
> git cat-file -e feat/admin-documents-notifications:apps/api/src/scripts/smoke.ts && echo "base OK"
> ```

| Spec | Branch | Persistence | Smoke |
|---|---|---|---|
| `01-web-url.md` | `agent/web-url` | no | optional |
| `02-packages-flags.md` | `agent/packages-flags` | **yes** (migration 1840000000000) | **mandatory** |
| `03-paginate-quotations.md` | `agent/paginate-quotations` | no | optional |
| `04-document-history.md` | `agent/document-history` | no | optional |
| `05-agent-assignments.md` | `agent/agent-assignments` | **yes** (migration 1850000000000) | **mandatory** |

⚠️ **Tasks 04 and 05 both touch `apps/api/test/support/database.fake.ts`** — 04 adds a `defineRelation`, 05 adds a `fakeDb` accessor. Run them in sequence, not in parallel, or expect a trivial conflict in the `fakeDb` map. No other pair shares a file.


## The thing to fix before any unattended run

**`constDocManagment/.env` contains live credentials** — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET` and `DB_PASS` are all set. RUNNER-RULES rules 9–11 say never read it, but **a rule in a markdown file is not enforcement.** An unattended agent that reads `.env` to "check the config" and then quotes a line into a blocker file has written a real AWS key into a file you may later commit.

Enforce it at the permission layer, not in prose. Write `tasks/runner-settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./apps/api/.env)",
      "Read(./apps/worker/.env)",
      "Edit(./.env)",
      "Write(./.env)",
      "Bash(git push*)",
      "Bash(git remote*)",
      "Bash(gh *)",
      "Bash(cat .env*)",
      "Bash(curl*)",
      "Read(../admin-frontend/**)",
      "Read(../customer-portal/**)",
      "Edit(./.github/**)",
      "Edit(./nginx/**)",
      "Edit(./docker/**)",
      "Edit(./compose.yml)",
      "Edit(./compose.prod.yml)"
    ]
  }
}
```

A `deny` rule wins over any allow and over `bypassPermissions`, so this holds even if the model decides otherwise.

## Per-task invocation

One process per task, sequential, each a **fresh session**. That is the right shape here: you said the five tasks are independent, so none of them benefits from another's context, and a fresh session means a mistake in task 2 cannot contaminate task 3.

```bash
cd E:\ConstructionWebsite\constDocManagment
git checkout feat/admin-documents-notifications          # the base branch, NOT main

for task in 01-web-url 02-packages-flags 03-paginate-quotations \
            04-document-history 05-agent-assignments; do
  claude -p "Read tasks/RUNNER-RULES.md, then execute tasks/${task}.md exactly as written. Stop and write tasks/blockers/ if anything is ambiguous." \
    --model opus \
    --settings tasks/runner-settings.json \
    --permission-mode bypassPermissions \
    --max-turns 120 \
    --output-format json \
    --effort high \
    > "tasks/logs/${task}.json" 2>&1
done
```

Why each flag:

| Flag | Why |
|---|---|
| `-p` | non-interactive; prints and exits. The agentic tool loop still runs in full — `-p` only removes the TTY, it does not make the run single-step. |
| `--settings tasks/runner-settings.json` | the deny list above. **This is the load-bearing one.** |
| `--permission-mode bypassPermissions` | the only mode that never blocks waiting for a human. `acceptEdits` auto-approves edits but still gates Bash, so the run would stall on the first `npm test` and you would find it exactly where you left it. Safe *only* because of the deny list. |
| `--max-turns 120` | bounds a runaway. Each of these tasks is a handful of files plus four verification commands; 120 is generous. Without it a confused agent can loop until your quota is gone. |
| `--output-format json` | one parseable result object per task, so you can see in the morning which exited cleanly without reading five transcripts. |
| `--effort high` | these specs involve schema drift and authorisation boundaries. Not the place to economise. |
| `--model opus` | the alias resolves to the latest Opus. You mentioned **Opus 4.6** — the aliases available here are `opus`, `sonnet`, `haiku`, `fable`, and the current generation is the Claude 5 family. If you specifically want a pinned older model, pass its full id rather than an alias, so the overnight run is reproducible. Worth confirming the id resolves before you leave it running. |

`mkdir tasks/logs tasks/blockers` first, or the redirect fails on task 1 and you lose the night.

## Two failure modes to expect

1. **Docker.** Tasks 02 and 05 are smoke-mandatory and declare themselves incomplete without it. Docker Desktop was **not running** during this audit. If it is still down overnight, those two tasks will correctly write blockers and commit nothing — which is the designed behaviour, not a failure, but it means two of five tasks produce no code. Start Docker and confirm `curl localhost:3001/health/ready` returns 200 before you leave.
2. **The branch base.** Every task branches from `main`. The five branches will therefore not see each other's work — correct for independence, but if two of them touch `.env.example` or `database.fake.ts` you get a merge conflict in the morning. I checked: **no two tasks share an allowed path**, so this should not arise. Task 04 and task 05 both touch `test/support/database.fake.ts` — **the one exception.** Run those two in sequence rather than in parallel, or expect a trivial conflict in `fakeDb`.

## Morning checklist

```bash
git branch --list 'agent/*'          # expect 5, or fewer if blockers were written
ls tasks/blockers/                   # read these first
cat tasks/DONE.md                    # what each task claims it verified
ls tasks/observations.md 2>/dev/null  # things noticed but correctly left alone
git log --oneline --all --not main   # one commit per branch, none pushed
git status --porcelain               # should be clean on main
```

For each branch, re-run the verification block from its spec yourself before merging. The agent asserting that `npm test` passed is not the same as it having passed.

