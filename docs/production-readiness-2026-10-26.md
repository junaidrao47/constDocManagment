# Production Readiness Audit — Grupo G2H / Servicios Integrales

**Date:** 2026-10-26
**Reviewer:** Claude Code (senior release/security/full-stack review)
**Repos reviewed (branch `claude/portal-enhancements` in all three):**
- `constDocManagment` — API (`apps/api`) + worker (`apps/worker`), nginx, Docker, docs
- `admin-frontend` (constDocAdmin) — Next.js 15.5.7 admin/staff portal
- `customer-portal` (constdoc-customer-portal) — Next.js 16.3.5 public site + customer portal

> **Scope of this file:** Phase A only, read-only. No code was changed in this phase; this report is the only file written.
> **Evidence rule (R1):** every claim cites a path or a command run in this session. Items not opened/run are marked **UNVERIFIED** or **NOT RUN**.

---

## OVERALL VERDICT: 🔴 NO-GO (not production ready)

The application layer is substantially built and the backend security middleware is strong, but there are **hard launch blockers** in four areas that are independent of feature work:

1. **Critical dependency CVEs** (Next.js RCE / source-code exposure) in both frontends.
2. **The two Next apps cannot be deployed** — no Dockerfiles, not in `compose.prod.yml`, and nginx has no server blocks for them and no TLS.
3. **Legal/content is template-only** — Privacy is a template, Terms & Cookies pages do not exist, real client facts are placeholders.
4. **Email cannot go to production** — SES is in sandbox and there is no bounce/complaint/suppression handling (an AWS prerequisite for production access).

Estimated minimum to a credible production launch (blockers only): **~5–7 working days of engineering** plus client inputs (legal text, business facts, domain) and AWS approvals (SES production access, which AWS controls on its own timeline).

---

## Tooling run this session (R4)

| Tool | Status | Notes |
|---|---|---|
| `npm audit --omit=dev` | **RUN** | Results in Area 11. api/worker/admin/customer each show 1 critical + highs. |
| `docker compose ps` / `/health/ready` | **RUN (passed earlier this session)** | api, worker, postgres, redis healthy; DB+Redis reachable. |
| S3 upload/download in S3 mode | **RUN (passed earlier this session)** | `saveHeroObject`→`cosntdoc-images`, public GET 200, delete OK. |
| `npm run smoke` | **NOT COMPLETED** | Initiated in-container; exceeded the 300s session window with no flushed output (Docker Desktop sluggish during the run). **Must be run to a green scoreboard before launch.** |
| gitleaks, semgrep, trivy (fs/image), hadolint, actionlint, ZAP | **NOT RUN** | Not installed on this host (`command -v` → not found). Belongs in CI (Phase C). |

---

## Area-by-area

### 1. Core story end-to-end on real Postgres in S3 mode — ⚠️ AT RISK (unproven this session)
**Evidence:** 25 migrations present (`apps/api/src/migrations/` 1700000000000-InitialSchema … 1960000000000-ServiceImageAndDetails), full module set in `apps/api/src/modules/` (auth, customers, documents, manager, agent, admin, quotations, catalog, categories, cms, public), ordered approval phases (`1920000000000-DocumentPhases.ts`), account status/onboarding/manager assignment migrations (1890/1900/1910). Stack verified healthy and S3 mode verified this session.
**Gap:** The authoritative gate `npm run smoke` (`apps/api/src/scripts/smoke.ts`) did **not** complete in-session, so register→approval→assignment→onboarding→upload→phases→reject/resubmit→official download is **not proven green today**.
**What smoke does NOT cover (by design):** real SES email delivery (sandbox), the online payment gateway (offline flow only), browser/UI behaviour, concurrency/load, S3 backup+restore, SNS delivery/bounce events, and anything behind nginx/TLS in the prod topology.
**Severity:** High · **Est:** 2h to run + fix any red · **Owner:** Claude Code.

### 2. Security — 🟢 strong core, 🔴 blocked by deps
**Present (evidence `apps/api/src/app.ts`):** `helmet()`; CORS allowlist (`env.corsOrigin`, refuses `*`/missing in production — `apps/api/src/config/env.ts` superRefine); global rate limit 100/min/IP; tighter auth limiter 10/15min with `skipSuccessfulRequests` on login/register/forgot/reset; `trust proxy 1`; per-request IDs; morgan access logs; RBAC via `authenticate` + `authorize(role)` on every protected mount; `enforceAccountStatus()` gate for customers; upload validation with MIME + magic-byte checks (`apps/api/src/modules/documents/upload-constraints.ts`, `apps/api/src/utils/magic-bytes.ts`); bcrypt password hashing (`seed-phase0.ts`).
**Gaps:**
- 🔴 **Critical dependency CVEs** — see Area 11 (Next.js RCE / Server Actions source exposure). Launch blocker.
- 🟠 **No persistent account lockout** — only rate limiting; repeated failures across windows are not locked out. (Medium)
- 🟠 **Token storage / transport** — Bearer access+refresh in JSON body (scope mentions httpOnly-cookie deviation); if frontends hold tokens in `localStorage` this is an XSS exfiltration risk. **UNVERIFIED** which store the frontends use. (Medium)
- IDOR/authorization tests exist in spirit (decision log references a `document-scoping` manager-visibility test) but coverage of "customer A cannot read customer B" across documents/quotations/invoices was **not exhaustively verified** this session. (Medium)
**Severity:** Critical (via deps) · **Est:** 3h deps + 4h lockout/token review + IDOR test sweep · **Owner:** Claude Code.

### 3. Data — 🟡 PARTIAL
**Evidence:** 25 sequential migrations incl. a dedicated `1830000000000-FixSchemaDrift.ts`; seeds are find-or-create/idempotent (`seed-phase0.ts` `upsertUser`, `seed-demo.ts` `is_demo=true`, demo purge `purge-demo.ts`); backup cron exists (`apps/worker/src/crons/backup.cron.ts`).
**Gaps:** backup **restore has not been tested** (no evidence of a restore drill); retention policy undefined; "migrations safe on existing prod data" not validated against a prod-like dataset. The repo's own CLAUDE.md flags schema drift as the top historical risk (tests use an in-memory fake), so only a real-Postgres smoke proves persistence.
**Severity:** High · **Est:** 3h (restore drill + retention note) · **Owner:** Claude Code + infra.

### 4. Infrastructure — 🔴 NO-GO
**Evidence:** `compose.prod.yml` services = **nginx, api, worker, postgres, redis only** — **no admin, no customer-portal**. Dockerfiles exist only for `apps/api`, `apps/worker`, `nginx` (no Dockerfile in `admin-frontend/` or `customer-portal/`). `nginx/nginx.conf`: TLS block is **commented out**, `server_name localhost`, root returns dev text `"ConstDocManagment local nginx is running…"`, and only `/api/` + `/health` are proxied — **no server blocks for the public site or admin**.
**Gaps:** two of three user-facing apps are not buildable or routable in the prod stack; no HTTPS; no per-host virtual servers (apex/www, admin., api.); no resource limits (`mem_limit`/cpus) or log rotation; EC2 sizing/swap (brief §7.9: t3.medium + swap) not provisioned. Postgres/Redis correctly unpublished in prod; api still publishes 3001 to host (should be internal-only behind nginx).
**Severity:** Critical · **Est:** 8–12h (2 Dockerfiles with `output:"standalone"`, compose.prod services, nginx vhosts + certbot/HSTS) · **Owner:** Claude Code + client (domain/DNS/Elastic IP).

### 5. CI/CD — 🔴 NO-GO
**Evidence:** only `constDocManagment/.github/workflows/ci.yml` exists; it runs typecheck/typecheck:test/test/build for **apps/api only**. `admin-frontend` and `customer-portal` have **no `.github/workflows`**.
**Gaps:** no worker job; no Postgres/Redis service containers; **no `npm run smoke` in CI**; no security scans (gitleaks/semgrep/trivy/hadolint); no image build/ECR push; no OIDC; no staging/prod deploy; no rollback; no branch protection/Dependabot. This is the whole of Phase C.
**Severity:** High · **Est:** 1–2 days · **Owner:** Claude Code (+ client/AWS for ECR/OIDC values).

### 6. Observability — 🟡 PARTIAL
**Present:** `/health` (liveness) + `/health/ready` (DB+Redis, bounded) in `app.ts`; per-request IDs; morgan combined logs tagged with request id.
**Gaps:** no error tracking (Sentry not present); no uptime/alerting; no queue-depth or SES send/bounce dashboards/alerts; logs go to stdout only (no rotation/shipping).
**Severity:** Medium · **Est:** 4–6h (Sentry + basic alerts) · **Owner:** Claude Code + infra.

### 7. Email — 🔴 NO-GO for production SES
**Present:** 16 Handlebars templates in `apps/worker/src/templates/` incl. a shared `_layout.hbs`; BullMQ email queue + processor (`apps/worker/src/queues/email.queue.ts`, `processors/email.processor.ts`); crons `expiry.cron.ts`, `renewal.cron.ts`. Some templates are bilingual (`account-approved.en/.es-MX`, `phase-completed.*`, `phase-rejected.*`).
**Gaps:**
- 🔴 **No SNS bounce/complaint handling and no suppression list** — grep for `email_suppress|SNS|bounce|complaint` found matches only in `node_modules`, not app code. AWS effectively requires this before granting production access.
- 🔴 **No email pipeline tables** (`email_rules` / `email_senders` / `email_log`) — not in any migration. (All of Phase E.)
- 🟠 **Partial i18n**: several templates are single-locale only (`document-approved.hbs`, `invoice.hbs`, `quotation-*.hbs`, `renewal-reminder.hbs`, `contact-inquiry.hbs`).
- 🟠 **Missing required templates**: registration/welcome, password-reset, document-received, subscription activated/expiring/expired, contact auto-reply, quotation/document expiry.
- SES is still in **sandbox** (`docs/CLIENT-FACTS.md`).
**Severity:** Critical (for email-dependent flows) · **Est:** 10–16h (Phase E) · **Owner:** Claude Code (code) + client (volume estimate) + AWS (approval).

### 8. Content & legal — 🔴 NO-GO
**Evidence:** `customer-portal/src/app/` has `privacy/` and `faq/` routes but **no `terms/` and no `cookies/`**. `[CLIENT_TO_CONFIRM]` appears **9×** in app code and `[LEGAL_REVIEW_REQUIRED]` 1×. `docs/CLIENT-FACTS.md` lists the unconfirmed facts, including the demo phone `+52 55 1234 5678` on the contact page and the illustrative "+60 empresas" hero chip.
**Gaps:** Privacy (Aviso de Privacidad) is a **template requiring legal review**; Terms and Cookies pages must be created; real legal entity/RFC, address, phone, hours, contact inbox must replace placeholders. **No compliance can be claimed** (R3).
**Severity:** Critical (legal) · **Est:** 4h wire-up · **Owner:** client (all text + facts) + Claude Code (render/versioning — Phase D).

### 9. Public site quality — 🟡 PARTIAL
**Present:** `customer-portal/src/app/sitemap.ts`, `robots.ts`, `manifest.ts`, `icon.png`; brand rename complete (**no user-facing "ConstDoc" leftover** in `admin-frontend/src` or `customer-portal/src`); homepage hero/overlay/reveal issues were fixed earlier this session (verified by screenshot).
**Gaps:** demo/test data visible (illustrative stats, demo phone — Area 8); Lighthouse/perf/accessibility **NOT RUN**; one console error observed in-session (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` — likely a cross-origin asset/report, minor, **UNVERIFIED** root cause); Open Graph images and JSON-LD not confirmed populated with real data.
**Severity:** Medium · **Est:** 4–6h + client facts · **Owner:** Claude Code (Phase F).

### 10. i18n — 🟡 PARTIAL
**Evidence:** customer portal uses a single `customer-portal/src/lib/messages.ts` with a locale toggle (default es-MX) — **not** the scoped next-intl `/en` + `/es-MX` routed structure (PROJECT-BRIEF §7.1). `admin-frontend` has **no messages file** → effectively single-language. Emails partially bilingual (Area 7). PDF (quotation) localisation **UNVERIFIED**.
**Severity:** Medium · **Est:** admin i18n 1–2 days (scope decision needed) · **Owner:** Claude Code + client (is routed i18n required for launch?).

### 11. Dependencies & licenses — 🔴 NO-GO
**`npm audit --omit=dev` (RUN this session):**
- `apps/api`: **4 vulns (3 high, 1 critical)**
- `apps/worker`: **5 vulns (1 critical, 2 high, 2 moderate)**
- `admin-frontend`: **5 vulns (1 critical, 4 high)** — critical `next` (Server Actions **source-code exposure** + DoS); high `postcss` (XSS), `sharp` (libvips CVEs), `source-map-js` (DoS), `zod` (memory exhaustion)
- `customer-portal`: **5 vulns (1 critical, 3 high, 1 moderate)** — critical `next` (**RCE in `next/og` ImageResponse**); high `sharp` (librsvg CVE), `source-map-js`, `zod`
**Gaps:** Trivy (image CVEs), semgrep, gitleaks, hadolint **NOT RUN** (not installed) — add in CI (Phase C). License review not done.
**Severity:** Critical · **Est:** 3h (`npm audit fix` + Next patch bump + re-test) · **Owner:** Claude Code.

### 12. Operational readiness — 🔴 NO-GO
**Present:** demo purge (`apps/api/src/scripts/purge-demo.ts`, `npm run db:purge:demo`); demo accounts documented (`docs/DEMO-ACCOUNTS.md`).
**Gaps:** no runbook, no rollback plan, no on-call/contact, no documented post-launch smoke procedure against production.
**Severity:** High · **Est:** 4h (runbook + rollback + post-deploy smoke) · **Owner:** Claude Code + client (on-call).

---

## Ranked blocker list (minimum to launch)

| # | Blocker | Sev | Est | Owner |
|---|---|---|---|---|
| 1 | Patch critical/high deps: Next.js CVEs in both apps + `npm audit fix` in api/worker/admin/customer; re-run typecheck/build | Critical | 3h | Claude Code |
| 2 | Dockerize admin + customer (`output:"standalone"`), add both to `compose.prod.yml`; nginx per-host server blocks + TLS (certbot) + HSTS + real `server_name`; remove dev placeholder | Critical | 8–12h | Claude Code + client (domain/DNS) |
| 3 | Legal: real Aviso de Privacidad text + create Terms + Cookies; replace all `[CLIENT_TO_CONFIRM]` (entity/RFC, address, phone, inbox, hours) | Critical | 4h wire-up | client (text) + Claude Code |
| 4 | Run `npm run smoke` to green on real Postgres in S3 mode; capture the scoreboard; fix any red | High | 2h+ | Claude Code |
| 5 | SES production prerequisites: SNS bounce/complaint endpoint (signature-verified) + `email_suppressions` + suppression enforcement; then complete `ses-production-request.md` | High | 10–16h | Claude Code + client (volume) + AWS |
| 6 | S3 backup + **tested restore** drill; define retention | High | 3h | Claude Code + infra |
| 7 | CI for all three repos incl. smoke (PG/Redis services) + security scans + image build/ECR via OIDC + deploy/rollback | High | 1–2 days | Claude Code + AWS |
| 8 | Runbook + rollback plan + post-launch smoke + on-call | High | 4h | Claude Code + client |
| 9 | Error tracking (Sentry) + uptime + queue/SES alerts | Medium | 4–6h | Claude Code + infra |
| 10 | Admin i18n (scope decision) + token-storage review + account lockout | Medium | 1–2 days | Claude Code + client |

---

## Launch-day checklist (run in order)

1. `.env` on the server filled with **real** secrets (strong JWT_SECRET ≠ JWT_REFRESH_SECRET, CORS_ORIGIN set to real origins, WEB_URL, MAIL_FROM); `chmod 600`. (Never commit.)
2. `docker compose -f compose.prod.yml up --build -d`; all services healthy (`/health/ready` = 200).
3. `docker compose exec api npm run db:migrate`; confirm no pending migrations.
4. `npm run smoke` against production (`SMOKE_API_URL=https://api.<domain>/api`) → **green**.
5. TLS valid for apex/www, admin., api.; HTTP→HTTPS redirect; HSTS present.
6. SES: production access granted; DKIM/SPF/DMARC pass; send one real test to a confirmed inbox; bounce/complaint SNS confirmed subscribed.
7. Legal pages live with client-approved text; no `[CLIENT_TO_CONFIRM]`/demo phone visible.
8. Backup cron verified writing to S3; one restore rehearsed.
9. Sentry receiving events; uptime monitor on `/health`; alert on queue backlog.
10. `npm run db:purge:demo` run; confirm no `is_demo` rows remain; seed only client-approved content.
11. Rollback tag noted; `scripts/rollback.sh` tested.

---

## What the client must provide (R3 — nothing here may be invented)

1. **Legal texts** — approved Aviso de Privacidad, Terms & Conditions, Cookies (or approval to use the generated templates).
2. **Business facts** — registered legal name + RFC, physical address, primary phone, contact inbox, business hours, founded year, social profile URLs.
3. **Real content** — services, packages and pricing rules; required-documents checklist per service; any real testimonials/logos/certifications (with permission to display client logos).
4. **Domain & DNS** — final domain, access to point apex/www/admin/api at the Elastic IP.
5. **AWS** — expected email volume (for SES request) and confirmation to proceed with SES production access; ECR repo names, account id, region, instance id, IAM role ARNs for CI/CD.
6. **Payment** — gateway choice (Stripe / Mercado Pago / offline-only for launch).
7. **On-call** — a contact/escalation path for launch day.

---

## Phase A report (R9)

- **DONE:** `docs/production-readiness-2026-10-26.md` (this file — the only file written in Phase A).
- **VERIFIED BY:** `git log --since="4 days ago"` (3 repos); `npm audit --omit=dev` (api/worker/admin/customer); reads of `apps/api/src/app.ts`, `config/env.ts`, `compose.prod.yml`, `nginx/nginx.conf`, `.github/workflows/ci.yml`, `docs/CLIENT-FACTS.md`; file/grep inventory of migrations, worker crons, email templates, legal routes, i18n files, `[CLIENT_TO_CONFIRM]`/`[LEGAL_REVIEW_REQUIRED]` occurrences; earlier-this-session `/health/ready` and S3 upload/download checks.
- **NOT DONE / NOT RUN:** `npm run smoke` to completion (Docker sluggish, exceeded 300s with no flushed output); gitleaks/semgrep/trivy/hadolint/actionlint/ZAP (not installed locally); Lighthouse/accessibility; PDF i18n; exhaustive IDOR test sweep; frontend token-storage confirmation.
- **ASSUMPTIONS:** report lives in `constDocManagment/docs/` (the canonical docs dir); "4 days ago" window captured the latest work (all repos last substantive commits 2026-10-25); `constDocAdmin`=`admin-frontend`, `constdoc-customer-portal`=`customer-portal`.
- **QUESTIONS:** see below.
- **NEXT:** on "go B", fix the ranked Critical/High blockers one small commit at a time, each with a verification command, in the owning repo only (R6), starting with #1 (deps) and #4 (smoke green) since they are fast and de-risk everything else.

**STOP — awaiting answers to the questions below, then "go B".**
