<!-- Task spec for an unattended Claude Code run. Source: docs/build-audit-2026-10-14.md
     Read tasks/RUNNER-RULES.md first; it overrides anything here that conflicts. -->

# 03 — Opt-in pagination for the quotation lists
**Branch** `agent/paginate-quotations` · **Base** `feat/admin-documents-notifications` · **Deps** none · **Changes persistence** no

**Goal.** `quotationService.list()` returns an unbounded array, and `docs/api-surface.md` §8 warns that retrofitting pagination after the tables exist is "a rewrite of every table component" — with ~12 table screens about to be built.

**The hard constraint:** three live frontend pages consume these endpoints as a bare array and break if the shape changes unconditionally — `admin-frontend/src/app/(admin)/admin/quotations/page.tsx:13`, `admin-frontend/src/app/(staff)/quotations/page.tsx:13`, `customer-portal/src/app/(portal)/dashboard/quotations/page.tsx:14`, each typed `apiRequest<Quotation[]>(...)`. So pagination is **opt-in**.

**Files to read first**
- `docs/build-audit-2026-10-14.md` — deviation **D8**, §8 Wave 1 task 2
- `docs/api-surface.md` §8 "List endpoints are paginated from day one"
- `apps/api/src/modules/payments/invoice.service.ts:110-140` — `listAdmin`, **the shape to copy**: `{ data, pagination: { page, pageSize, total, totalPages } }`
- `apps/api/src/modules/payments/invoice.schema.ts:6-12` — the `page`/`pageSize` coercion and the `max(100)` ceiling
- `apps/api/src/modules/documents/document.service.ts:182-205` — the same shape again; 2 of 3 existing endpoints use it
- `apps/api/src/modules/admin/admin-user.service.ts:76-108` — the **other** shape, `{ items, total, page, pageSize }`. **Do not copy this one.**
- `apps/api/src/modules/quotations/quotation.service.ts:229-240` — `list()`, plus `normalizeItem`, `expireIfNeeded`, `withPublicCustomer`
- `apps/api/src/modules/quotations/quotation.schema.ts` · `apps/api/src/middleware/validate.ts` (`validateQuery`)
- `apps/api/test/support/fake-repository.ts:223-241` — `find` honours `skip`/`take`, `findAndCount` exists, `createQueryBuilder()` **throws**

**Files allowed to change.** `quotation.schema.ts` · `quotation.service.ts` · `admin.router.ts` (**the `GET /quotations` line only**) · `agent.router.ts` (**the `GET /quotations` line only**) · `customer.router.ts` (**the `GET /me/quotations` line only**) · `apps/api/test/quotation-pagination.test.ts` **(new)**

**Files forbidden.** `invoice.service.ts`, `document.service.ts`, `admin-user.service.ts` — the three existing paginated endpoints keep their current shapes, **including the inconsistent `{items,...}` one**; unifying them is a separate breaking task. Also both frontend repos, and the global forbidden list.

**What to do**
1. `QuotationListQuerySchema` in `quotation.schema.ts`: `page` coerced int min 1 default 1 · `pageSize` coerced int min 1 **max 100** default 25 · `limit` coerced int min 1 max 100 **optional alias** — when both are given, **`pageSize` wins** · `sort` optional enum, **exactly** `createdAt | -createdAt | totalPrice | -totalPrice | status | -status`, leading `-` means DESC, default `-createdAt` (preserving today's `order: { createdAt: "DESC" }`) · `status` optional, validated with the existing `isQuotationStatus`. An unknown `sort` must **400**, never fall through to an unvalidated column name: map the sort key through an explicit allow-list object, never interpolate it.
2. `quotationService.list(actor, query?)`:
   - **If `query` is undefined or none of `page`/`pageSize`/`limit` is present → return the bare array exactly as today**, same ordering and the same `normalizeItem` / `expireIfNeeded` / `withPublicCustomer` treatment.
   - Otherwise `findAndCount` with `skip`/`take`, returning `{ data, pagination: { page, pageSize, total, totalPages } }` with identical per-row treatment.
   - Keep the customer ownership filter (`customerId: actor.id`) on **both** paths. It must not become bypassable.
3. Wire `validateQuery(QuotationListQuerySchema)` onto the three routes and pass the parsed query into `list()`.

**Acceptance criteria (command-verifiable)**
1. `curl -s -H "Authorization: Bearer $ADMIN" localhost:3001/api/admin/quotations | jq -e '.data | type == "array"'` → exits 0
2. `curl -s ... "?page=1&pageSize=2" | jq -e '.data.data | type == "array"'` and `| jq -e '.data.pagination.totalPages | type == "number"'` → both exit 0
3. `curl -s ... "?limit=1" | jq -e '.data.data | length <= 1'` → exits 0
4. `pageSize` wins over `limit` when both given — test
5. `?pageSize=101` → 400 · 6. `?sort=hax` → 400
7. `grep -rn "createQueryBuilder" apps/api/src/modules/quotations/` → **no output**
8. `git diff --name-only feat/admin-documents-notifications -- apps/api/src/modules/payments/invoice.service.ts apps/api/src/modules/documents/document.service.ts apps/api/src/modules/admin/admin-user.service.ts` → **no output**

**Tests to add** — `apps/api/test/quotation-pagination.test.ts`: no param → bare array for all three roles · `?page=2&pageSize=1` over 3 seeded quotations → 1 item, `total: 3`, `totalPages: 3` · `?limit=2` behaves as `pageSize=2` · `?limit=5&pageSize=1` → 1 item · `?pageSize=101`, `?page=0`, `?sort=hax` each 400 · `?sort=totalPrice` and `-totalPrice` give opposite orders · **ownership holds under pagination**: a customer with 1 quotation, in a DB holding another customer's 2, sees `total: 1` and only their row, on both paths · a paginated row still has normalised `items` with `unitPrice`/`lineTotal`, and `customer` carries only public fields (no `passwordHash`) — cross-check `test/no-user-secrets.test.ts`.

**Verification.** `cd apps/api && npm run typecheck && npm run typecheck:test && npm test` (expect ≥ 131). Smoke not required; if Docker is up run it — the smoke script calls `GET /admin/quotations` with no params, so it exercises criterion 1.

**Do not do.** **Change the response shape unconditionally** — three frontend pages break and nobody is awake to notice · touch either frontend repo · "unify" the `{items,...}` shape in `admin-user.service.ts` · add pagination to `GET /api/agent/documents`, `listReviewDocuments`, or any `/api/public/*` or other `/me/*` list (this task is the three quotation lists only) · interpolate `sort` into SQL or a `find` key · use `createQueryBuilder` · remove or weaken the ownership filter.
