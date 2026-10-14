<!-- Task spec for an unattended Claude Code run. Source: docs/build-audit-2026-10-14.md
     Read tasks/RUNNER-RULES.md first; it overrides anything here that conflicts. -->

# 01 — Route WEB_URL through validated config and fix portal links
**Branch** `agent/web-url` · **Base** `feat/admin-documents-notifications` · **Deps** none · **Changes persistence** no

**Goal.** `WEB_URL` is validated in `config/env.ts` but is absent from `.env.example` and read twice as raw `process.env`, bypassing validation. Unset, those two sites emit the bare relative link `/portal/documents` in an email. Separately all seven templates link to `/portal/...` while the portal's real routes are `/dashboard/...` — so even with `WEB_URL` set, every email link 404s. Fix both.

**Files to read first**
- `docs/build-audit-2026-10-14.md` — deviation **D18**, §8 Wave 1 task 1
- `apps/api/src/config/env.ts` — schema, `optional()` helper, `ENV_VAR_BY_KEY`, production `superRefine`
- `apps/api/src/modules/auth/auth.service.ts:52-66` — **`resolveWebUrl()` already exists.** Prefers `env.webUrl`, falls back to the first CORS origin, strips trailing slashes, deliberately never trusts a request header. **Reuse it. Do not write a second one.**
- `apps/api/src/modules/notifications/notify.service.ts:109` — raw read #1
- `apps/api/src/modules/documents/document.service.ts:407` — raw read #2
- `apps/api/test/support/env.setup.ts:35` — tests already set `WEB_URL=http://localhost:5173`
- `.env.example` — match the existing comment style

**Files allowed to change.** `.env.example` (add `WEB_URL` only) · `apps/api/src/config/env.ts` · `apps/api/src/utils/web-url.ts` **(new)** · `apps/api/src/modules/auth/auth.service.ts` (replace the local function with an import, nothing else) · `apps/api/src/modules/notifications/notify.service.ts` · `apps/api/src/modules/documents/document.service.ts` · all seven `apps/worker/src/templates/*.hbs` · `apps/api/test/web-url.test.ts` **(new)**

**Files forbidden.** `.env` · `apps/worker/src/config/env.ts` (the worker's `MAIL_FROM` guard is a separate task) · the global forbidden list.

**What to do**
1. Move `resolveWebUrl()` verbatim into `apps/api/src/utils/web-url.ts`, keeping its doc comment (the warning about never deriving the URL from a request header is the point of it). `auth.service.ts` imports it. Behaviour must not change.
2. `notify.service.ts:109` → `portalUrl: resolveWebUrl() ?? ""`.
3. `document.service.ts:407` → a `resolveWebUrl()`-based **absolute** URL pointing at `/dashboard/documents`.
4. Add `WEB_URL` to `.env.example` under the existing URL/CORS block, placeholder value, one-line comment.
5. Add `WEB_URL` to the production `superRefine` beside the `mailFrom` check, same voice: production must not boot without it or every email link is relative and unclickable.
6. Rewrite the link path in all seven templates: `/portal/documents` → `/dashboard/documents` (2 files) · `/portal/quotations` → `/dashboard/quotations` (3 files) · `/portal/invoices` → **`/dashboard/billing`** (2 files). The portal has **no** `/dashboard/invoices` route; invoices render at `/dashboard/billing`. Decided, not a guess.

**Acceptance criteria (command-verifiable)**
1. `grep -rn "process.env.WEB_URL" apps/api/src | grep -v "config/env.ts"` → **no output**
2. `grep -rn "/portal/" apps/worker/src/templates/` → **no output**
3. `grep -rc "{{portalUrl}}/dashboard/" apps/worker/src/templates/*.hbs` → seven files, each ≥ 1
4. `grep -n "^WEB_URL=" .env.example` → exactly one match
5. `grep -rn "function resolveWebUrl" apps/api/src` → exactly one match, in `utils/web-url.ts`
6. `git status --porcelain .env` → **no output**

**Tests to add** — `apps/api/test/web-url.test.ts`: `resolveWebUrl()` strips trailing slashes from `env.webUrl`; falls back to the first `CORS_ORIGIN` and returns `null` when that is `*`; a document status change to `approved` enqueues an email whose `data.documentUrl` is absolute and ends `/dashboard/documents`; a quotation transition to `sent` enqueues one whose `data.portalUrl` is non-empty with no trailing slash. Assert with `queuedEmails` from `test/support/email-queue.fake.ts`. Reuse `testApp()`, `seedUser()`, `mintToken()`, `bearer()`, `seedDocument()`, `resetTestState()` from `harness.ts` — do not build a new harness.

**Verification.** `cd apps/api && npm run typecheck && npm run typecheck:test && npm test` (expect ≥ 124 passing) then `cd ../worker && npx tsc --noEmit -p .`. Smoke not required (no schema change); if Docker is up, run it and confirm the SKIP list is unchanged.

**Do not do.** Write a second `resolveWebUrl` · make `webUrl` required outside production · touch `.env` · change `apps/worker/src/config/env.ts` or add a worker `MAIL_FROM` guard · restyle, rewrap or reword template bodies (change only the `href`) · add `/dashboard/invoices` · change `auth.service.ts` beyond the import swap — reset-link behaviour is covered by `test/auth-reset-token.test.ts` and must not change.
