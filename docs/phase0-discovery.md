# Phase 0 — Discovery (read-only)

> Grupo G2H / Servicios Integrales platform. Covers the three colocated repos under `E:\ConstructionWebsite`:
> **backend** (`constDocManagment`), **admin/staff portal** (`admin-frontend`), **public site + customer portal** (`customer-portal`).
> Every claim is cited to a file. `UNVERIFIED` = not opened this session.

## 0. Environment state (verified this session)
- Backend stack is **up and healthy** via `docker compose up --build -d` from `constDocManagment/`:
  `GET http://localhost:3001/health/ready` → `{"status":"ready","checks":{"database":true,"redis":true}}`. Containers: api, worker, postgres (`127.0.0.1:15432`), redis (`127.0.0.1:16379`).
- `admin-frontend` dev server: **http://localhost:3000** (serving `/staff`, `/staff/login`).
- `customer-portal` dev server: **http://localhost:3002** (Next.js 16.3.5, Ready).
- Ground docs assumed by the brief that **do not exist**: `docs/ARTIFACT-CONTEXT.md`, `docs/CLIENT-FACTS.md`, `docs/design-tokens.md`. (`decision-log.md`, `client-decisions.md`, `api-surface.md`, `delivery-plan.md` do exist.)
- No `UNSPLASH_ACCESS_KEY` in `constDocManagment/.env.example` (AWS keys present: `AWS_REGION`, `S3_BUCKET`, `S3_BACKUP_BUCKET`). User confirmed: no Unsplash key and no client facts available.

## 1. "ConstDoc" occurrences (W8)
### User-facing — MUST change (3)
- `constDocManagment/apps/api/src/utils/quotation-pdf.ts:9` → `"ConstDoc Management"` (printed on quotation PDFs).
- `constDocManagment/apps/worker/src/crons/renewal.cron.ts:24` → email subject `"Your ConstDoc subscription is renewing soon"`.
- `customer-portal/src/app/contact/page.tsx:43,47` → `hello@constdoc.example` (mailto + visible text).

### Identifiers — KEEP (do not rename)
- `admin-frontend/src/lib/auth-context.tsx:7` → `SESSION_STORAGE_KEY = "constdoc.session"`.
- `customer-portal/src/lib/auth-context.tsx:12,19` + `src/proxy.ts:10,16` → storage keys / `constdoc.customer.authed` cookie.
- `apps/api/package.json`, `apps/worker/package.json` (`constdocmanagement-*`), `compose.prod.yml` service names, `.env` DB name `construction_db`, `admin-frontend/tsconfig.json` path alias.
- `.playwright-mcp/*.yml` (old capture cache) and `.claude/skills/*` (tooling) — ignore.

**Note:** the frontends already brand as "Grupo G2H" widely (`admin-frontend/src/app/layout.tsx:18-19`, `customer-portal/src/app/layout.tsx:27`, `customer-portal/src/components/brand-logo.tsx`). W8 is small.

## 2. i18n status
- **No `messages/en.json` / `es-MX.json` found** in either frontend (searched `*/messages/*`). The brief's "no hardcoded strings / next-intl" rule is **not implemented**; UI strings are inline English. Full bilingual i18n is a large gap — flagged, not assumed in scope for the demo push unless you want it.

## 3. Backend support per workstream (evidence)
| Need | Status | Evidence |
|---|---|---|
| Public pricing calculator (read) | **EXISTS** | `POST /api/public/quotations/calculate` — `apps/api/src/modules/public/public.router.ts:41` |
| Admin pricing CRUD (industries/locations/worker-ranges/services) | **EXISTS** | `apps/api/src/modules/admin/admin.router.ts:234-266`, `admin-pricing.service.ts`, `admin-pricing.schema.ts` |
| City-fee / location-multiplier / quotation-validity editing | **UNVERIFIED** | to confirm in Phase 2 against `admin-pricing.*` |
| Contact submit | **EXISTS** | `POST /api/public/contact` → `contactService.submit` — `public.router.ts:44`, `modules/contact/contact.service.ts` |
| Categories / services / packages CRUD | **EXISTS (entities + routers)** | `modules/categories/category.router.ts`, `service.entity.ts`, `package.entity.ts` |
| Onboarding / personas / manager assignment | **EXISTS (entities)** | `customer-profile.entity.ts`, `customer-manager-assignment*.entity.ts`, `document-phase*.entity.ts` |
| Payments / invoices / subscriptions (→ analytics revenue) | **EXISTS (entities)** | `payment.entity.ts`, `invoice.entity.ts`, `subscription.entity.ts` |
| **CMS: `site_content` / `site_banners` / `site_settings`** | **MISSING** | no matching entity/table (`app-setting.entity.ts` is generic only) → **build + migrations** (W4) |
| Demo-flag (`is_demo` / `ALLOW_DEMO_SEED`) | **MISSING** | no matches in `apps/api/src` → need `seed-demo.ts` + `purge-demo.ts` (W1) |
| Seed (existing) | `seed-phase0.ts`, `reset-phase0.ts`, `create-admin.ts`, `smoke.ts` | `apps/api/src/scripts/` — not demo-flagged |

## 4. Frontend pages that exist today
- **admin-frontend**: `/admin` dashboard, `analytics`, `categories`, `customers`, `documents`, `packages`, `quotations`, `services`, `settings`, `users`; staff: `customers`, `customers/[id]`, `documents`, `documents/[id]`, `oversight`, `quotations`; auth: `admin/login`, `staff/login`, `login`; `403`.
  - **Missing UI**: dedicated **calculator/pricing-config page with live preview** (W3), **CMS content/banner/fonts editor** (W4), **contact-messages inbox**.
- **customer-portal**: public `/` (home), `about`, `services`(+`[slug]`), `packages`(+`[slug]`), `contact`, `faq`, `login`, `register`; portal: `onboarding`, `dashboard`(+`billing`,`documents`,`documents/[id]`,`quotations`,`quotations/[id]`).
  - **Missing**: legal pages (Aviso de Privacidad / Terms / Cookies), CMS-driven content, client-logos strip data, SEO assets (sitemap/robots/JSON-LD — UNVERIFIED), image pipeline.

## 5. Per-repo phase mapping
- **Phase 1** — `backend`: W8 (3 strings) + W1 (demo seed/purge, demo-flagged). `frontends`: W8 (confirm brand constant) + brand tokens.
- **Phase 2** — `backend`: W3 (verify/extend pricing endpoints) + **W4 CMS tables/endpoints/migrations (greenfield)**. `admin-frontend`: calculator-config UI + CMS admin UI.
- **Phase 3** — `customer-portal`: W5 (content, SEO, design polish, legal pages) + W6 (images; **blocked on Unsplash key → placeholder pipeline**).
- **Phase 4** — `frontends`: W2 Playwright screenshots (stack is up ✓) + W7 research (categories/personas PROPOSAL, reference-site scan).

## 6. Blockers / decisions
- **No Unsplash key** → W6 cannot hotlink/API-fetch. Plan: build S3/CMS image pipeline + a documented search-query list; use clearly-flagged placeholder images in the meantime.
- **No client facts** → will create `docs/CLIENT-FACTS.md` with `[CLIENT_TO_CONFIRM: …]` placeholders; any demo values flagged as demo, never shown as real.
- **No AWS creds locally** → CMS image upload needs a dev fallback (local `/public/uploads`) with the S3 presigned-POST path reserved for prod.
- CMS + bilingual i18n are the two largest net-new builds.
