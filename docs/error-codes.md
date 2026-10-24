# API Error Codes

Every non-2xx response from the API uses one envelope:

```json
{ "success": false, "error": { "code": "...", "message": "...", "details": { "field": ["..."] }, "requestId": "..." } }
```

`code` is the stable, machine-readable key. Frontends branch and localise on `code`,
not on the English `message`. `message` is for developers and logs and never contains a
stack, SQL, or an internal name. `details` appears only on validation failures.

The code is produced in one of two ways:

- **Named at the throw site** via `new AppError(code, httpStatus, message, details?)` — used where a caller benefits from distinguishing the case (e.g. an illegal status transition from any other 409).
- **Derived from the HTTP status** for the many `new HttpError(status, message)` call sites that predate string codes, via `STATUS_TO_CODE` in `apps/api/src/utils/http-error.ts`.

## Codes

| Code | HTTP | When it occurs |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Request body/query/params failed Zod validation. `details` holds per-field errors. Also the agent document-status query guard. |
| `BAD_REQUEST` | 400 | A 400 raised without a more specific code (generic `HttpError(400, …)`, non-size multer errors). |
| `MALFORMED_JSON` | 400 | Request body is not valid JSON (body-parser `SyntaxError`). |
| `NOTE_REQUIRED` | 400 | A document rejection was attempted without the required rejection note (service-level guard). The status route's schema catches the common case as `VALIDATION_FAILED` first. |
| `UPLOAD_INCOMPLETE` | 400 | A version was confirmed before its bytes arrived, the stored object is empty, or a local byte sink received nothing (`document.service.ts` `confirmVersion`/`uploadVersionBytes`). |
| `UNAUTHENTICATED` | 401 | No bearer token, an invalid/expired token, a non-access token type, or a session no longer valid (disabled/demoted/stale). Also thrown JWT errors. |
| `FORBIDDEN` | 403 | Authenticated but the role is not allowed on the route. |
| `ACCOUNT_PENDING` | 403 | A customer whose account is still `pending_approval` tried to use a gated route (`middleware/account-status.ts`). `/customers/me` (read) and `/customers/me/onboarding` stay reachable. |
| `ACCOUNT_SUSPENDED` | 403 | A customer whose account is `suspended` tried to use a gated route. Same gate and exceptions as `ACCOUNT_PENDING`. |
| `MANAGER_REQUIRED` | 400 | An admin approved a customer without supplying a `managerId` — approval must assign a manager (`admin-customer.service.ts`). |
| `PHASE_INVALID_TRANSITION` | 409 | A document phase was moved to a status not reachable from its current one (`documents/phase-status.ts`). |
| `NOT_ENTITLED` | 403 | The customer is not entitled to upload for this service (`canUploadDocuments`), or the customer requested an official file that is not available yet. Returns `true` for now (PROJECT-BRIEF §10.4), so the download guard is its live throw site. |
| `NOT_FOUND` | 404 | No such resource, or no `/api` route matched the request. |
| `CONFLICT` | 409 | A uniqueness/state conflict, including a Postgres `23505` unique violation (reported without the constraint name). Also a duplicate category slug. |
| `CATEGORY_NOT_FOUND` | 400 | A service or package was created/updated with a `categoryId` that does not exist. |
| `CATEGORY_INACTIVE` | 400 | A service or package referenced a category that exists but is deactivated. |
| `INVALID_STATUS_TRANSITION` | 409 | A document or quotation was moved to a status that is not reachable from its current one. |
| `CATEGORY_NOT_EMPTY` | 409 | A category still has services or packages attached and cannot be deleted; deactivate it instead. |
| `DOCUMENT_LOCKED` | 409 | A new version cannot be added in the document's current status: a customer/staff version only while `pending` or `rejected`, an official file only while `submitted_to_government` (`document.service.ts` `assertCanCreateVersion`). |
| `UPLOAD_EXPIRED` | 410 | The upload window (intent TTL, 15 min) passed before the version was confirmed; request a new one. |
| `FILE_TOO_LARGE` | 413 | Upload exceeds the 25 MB limit (multer `LIMIT_FILE_SIZE`, or a `confirmVersion` HEAD showing the stored object is over the ceiling). |
| `FILE_TYPE_NOT_ALLOWED` | 415 | Upload's MIME type / extension pairing is not on the allow-list, or the stored object's magic bytes do not match its declared type. |
| `RATE_LIMITED` | 429 | The general or credential rate limiter tripped. |
| `INTERNAL_ERROR` | 500 | An unexpected/unclassified failure. The body is generic; the stack is in the log under the `requestId`. |
| `SERVICE_UNAVAILABLE` | 503 | A dependency needed to serve the request is unavailable (e.g. the session store during authentication). |

## Defined but not yet thrown

All document-pipeline codes (`DOCUMENT_LOCKED`, `NOT_ENTITLED`, `UPLOAD_EXPIRED`,
`UPLOAD_INCOMPLETE`) now have live throw sites and have moved into the table above
(version pipeline, decision-log 2026-10-23).

- `ONBOARDING_INCOMPLETE` (400) — reserved. Intended for a future rule that gates a
  specific customer action behind a completed onboarding profile (PROJECT-BRIEF §11.4).
  Not thrown yet: account access is gated by approval status (`ACCOUNT_PENDING`), not by
  onboarding completeness, and no current action requires a complete profile. The
  completeness flag is already computed and returned by `GET /customers/me/onboarding`.
