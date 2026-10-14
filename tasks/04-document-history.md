<!-- Task spec for an unattended Claude Code run. Source: docs/build-audit-2026-10-14.md
     Read tasks/RUNNER-RULES.md first; it overrides anything here that conflicts. -->

# 04 — GET /api/documents/:id/history
**Branch** `agent/document-history` · **Base** `feat/admin-documents-notifications` · **Deps** none · **Changes persistence** no (read-only over an already-populated table)

**Goal.** `document_status_history` is written on every status change and has a real `document_status_enum`, but **no endpoint exposes it**. The quotation equivalent already exists (`GET /api/admin/quotations/:id/history`), so this is the missing half of an established pattern — which is why the audit rates it **S**.

**Files to read first**
- `docs/build-audit-2026-10-14.md` — deviation **D11**, §4.11, §8 Wave 3 task 13
- `apps/api/src/modules/quotations/quotation.service.ts:287-290` — `history()`, **the pattern to mirror**: assert access by calling `get()` first, then return rows ordered `createdAt: "ASC"`
- `apps/api/src/entities/document-status-history.entity.ts` — note `changedBy` (uuid) and the `changedByUser` relation
- `apps/api/src/modules/documents/document.service.ts:111-153` — `requireDocument()` and **`assertCanReadDocument()`**, the single helper that decides document visibility. Use it; do not write a second check.
- `apps/api/src/modules/documents/document.router.ts:167-186` — the existing `READ_ROLES` gate and `sendAsync` + `validateParams` wiring
- `apps/api/src/utils/serialize-user.ts` — **`toPublicUser()`**. A loaded `UserEntity` carries `passwordHash` and `tokensValidFrom`.
- `apps/api/test/support/database.fake.ts:51-57` — how `defineRelation` hydrates a relation; and `fakeDb.documentHistory()`
- `docs/decision-log.md` — the 2026-10-11 entry "API responses never embed a raw UserEntity". **Do not regress this.**

**Files allowed to change.** `document.service.ts` · `document.router.ts` · `apps/api/test/support/database.fake.ts` (add a `defineRelation` for `DocumentStatusHistoryEntity.changedByUser` **only**) · `apps/api/test/document-history.test.ts` **(new)**

**Files forbidden.** `document-status-history.entity.ts` (no schema change) · `src/migrations/**` · `utils/serialize-user.ts` · the global forbidden list.

**What to do**
1. `documentService.history(actor, documentId)`: `requireDocument()` → 404 if absent; **`assertCanReadDocument()`** → 403 if not permitted (**call the existing helper** — it is the one place that decides this, and both task 05 and the follow-up scoping work land there); return rows for that document ordered `createdAt: "ASC"`, shaped `{ id, fromStatus, toStatus, note, createdAt, changedBy: PublicUser | null }`. `changedBy` is the actor's public fields **only**, via `toPublicUser()` — never the raw relation; `null` for a system transition.
2. Add `GET /:id/history` to `documentRouter` next to the other read routes, gated `authorize(...READ_ROLES)` with `validateParams(DocumentIdParamSchema)` and `sendAsync`, exactly as its neighbours. `READ_ROLES` is already `[Customer, ...STAFF_ROLES]`.
3. In `database.fake.ts`, register a relation so the fake hydrates `changedByUser` from the users table the way Postgres would — mirroring the existing `QuotationEntity.customer` block, hydrating the **full** row with secrets, so a test fails if `toPublicUser()` is skipped.

**Acceptance criteria (command-verifiable)**
1. `grep -n '"/:id/history"' apps/api/src/modules/documents/document.router.ts` → exactly one match
2. The owning customer gets 200 and an array ordered oldest-first — test
3. A different customer gets **403, not 404 and not an empty array** — test (api-surface §8: a record that exists but is not yours returns 403 on a direct fetch by id)
4. Agent, manager and admin each get 200 — test · 5. Unknown id → 404 — test
6. **No secret escapes:** the response body for a row with a real actor contains no `passwordHash` and no `tokensValidFrom` — assert on the serialised JSON, not the object
7. `grep -c "assertCanReadDocument" apps/api/src/modules/documents/document.service.ts` → count increases by exactly 1, and no new inline role check is added
8. `git diff --name-only feat/admin-documents-notifications -- apps/api/src/migrations/ apps/api/src/entities/` → **no output**

**Tests to add** — `apps/api/test/document-history.test.ts`: owner gets history oldest-first with `fromStatus` null on row 1 · another customer → 403 · agent, manager, admin each → 200 · unknown id → 404 · a row whose `changedBy` is a seeded agent returns `{ id, email, name, phone, role }` and **nothing else** (assert the exact key set) · a row with `changedBy: null` returns `null` · `JSON.stringify(response.body)` contains neither `passwordHash` nor `tokensValidFrom` · end-to-end: drive `PATCH /documents/:id/status` pending → under_review → approved, then assert three rows in that order. Use `seedDocument()`, `seedUser()`, `mintToken()`, `bearer()`, `testApp()`, `resetTestState()` and `fakeDb.documentHistory()`.

**Verification.** `cd apps/api && npm run typecheck && npm run typecheck:test && npm test` (expect ≥ 129). Smoke not required; run it if Docker is up and confirm the SKIP list is unchanged.

**Do not do.** Add, alter or migrate any column (this is a read endpoint over existing data) · write a second access check · return the raw `changedByUser` relation or add fields to `PublicUser` · return 404 for a document that exists but is not the caller's · add a history endpoint for any other module · add pagination (history is short and bounded, and task 03 owns the pagination shape) · change `fakeDb`'s existing relations or accessors beyond the one new `defineRelation`.
