# Phase 0 — Discovery: CMS (Hero + Content) + DevSecOps + Production Docker

> Read-only discovery. No code written. Every claim cites a file path (R1); anything not opened is marked **UNVERIFIED**.
> Date: 2026-10-25. Workspace: `E:\ConstructionWebsite` (3 sibling git repos). Author gate: run commands in later phases only — nothing here was executed, so all verification columns read **NOT RUN**.

## Repo map (verified by directory listing)

| Local folder | Role | Brief's name (PROJECT-BRIEF §2) | Stack (from package.json) |
|---|---|---|---|
| `constDocManagment` | Backend monorepo: `apps/api`, `apps/worker`, `nginx`, Docker, docs | `constDocManagment` | Express 4.21 + TypeORM 0.3 + Postgres 16 + Redis 7 + BullMQ, AWS S3/SES |
| `admin-frontend` | Admin + staff portal | `constDocAdmin` | Next.js **15.5.7**, React 19, radix-ui, recharts, TanStack Query, RHF+Zod |
| `customer-portal` | Public site + customer portal | `constdoc-customer-portal` | Next.js **16.3.5**, React 19, radix-ui, TanStack Query, RHF+Zod |

Each subfolder is its own git repo (`.git` present in each). The top-level `E:\ConstructionWebsite` is **not** a git repo. There is **no monorepo tooling** linking the three.

---

## a) What already exists in this workspace

### Hero / banners
- `customer-portal/src/components/home/hero.tsx` — a **static, single-image** hero. Photo comes from `heroImage` in `customer-portal/src/data/site-images.ts` (static import, falls back to a CSS gradient if the file is missing). Text comes from `t(locale, "home.hero.*")` in `customer-portal/src/lib/messages.ts`. Has a scroll parallax + `ken-burns` CSS animation, both gated on `prefers-reduced-motion`.
- **No carousel. No `hero_slides` table. No admin control.** The hero is hard-coded in the component and message file. `grep -i "hero|carousel|slide"` finds only this component, docs, and the static `site-images.ts` — no backend hero model anywhere.

### Content / CMS
- `apps/api/src/entities/app-setting.entity.ts` — an `app_settings` **key/value JSONB store** keyed by `key`, with `updated_by` + `updated_at`. Whitelisted keys today (per `admin-pricing.schema.ts`): `currency`, `quote_validity_days`, `payment_terms_days`, `contact_recipient_email`. Admin writes go through `PUT /admin/...settings` (schemas `SettingKeyParamSchema`, `SettingUpdateSchema` in `apps/api/src/modules/admin/admin-pricing.schema.ts`). **This is reusable for `cms_settings`.**
- **No `site_content` table, no content-key registry, no draft/publish/versioning for free text.** UI copy lives entirely in `customer-portal/src/lib/messages.ts` and `admin-frontend` message constants (hard-coded in code, not DB-managed).
- Bilingual DB fields already exist on catalog rows (`name_en/name_es`, etc.) — pattern to follow for bilingual content.

### S3 upload pipeline (REUSABLE — present)
- `apps/api/src/utils/s3.ts` is a complete pipeline with local-disk fallback:
  - `createUploadPost({key, contentType, maxBytes})` → **presigned POST** that makes S3 enforce exact `Content-Type` + a `content-length-range` ceiling at upload time (lines 163–185).
  - `headObject` + `getObjectRange` → size/type read-back and first-bytes fetch for a **magic-byte check** (lines 188–234).
  - `saveCatalogObject(...)` → server-side `PutObject` for public catalog images into a `${entityType}s/{id}/{main|gallery}/` prefix with `CacheControl: public, max-age=31536000, immutable`, returning a **public** `https://{bucket}.s3.{region}.amazonaws.com/{key}` URL (lines 50–70). ← the closest existing "public image" path.
  - `getUploadUrl`/`getDownloadUrl` → presigned PUT/GET (900 s).
- `apps/api/src/utils/magic-bytes.ts` exists (magic-byte helper). `apps/api/src/modules/documents/upload-constraints.ts` defines `ALLOWED_UPLOAD_TYPES`, `ALLOWED_EXTENSIONS`, `MAX_UPLOAD_BYTES`.
- The document flow is the **intent → confirm** pattern to copy:
  - `POST /documents/upload-url`, `POST /documents/:id/versions/upload-intent`, `POST /documents/:id/versions/:versionId/confirm` (`apps/api/src/modules/documents/document.router.ts:118–155`), plus single-call `POST /:id/upload` using `multer` memoryStorage with a `fileFilter` type allow-list and size limit (lines 39–69).
- **No `sharp`** in `apps/api/package.json` or `apps/worker/package.json`. **No AVIF/WebP variant generation exists** — catalog images are stored as the original only. Variant generation is NET-NEW work.

### Privacy / legal pages
- **None exist.** `grep -i "privacy|aviso|privac"` over `customer-portal/src` returns zero files. `CLIENT-FACTS.md` lists `[CLIENT_TO_CONFIRM: Aviso de Privacidad text]` and `[... Terms ...]`. No `privacy_policy_version`, no accepted-version storage on registration/onboarding (UNVERIFIED that onboarding has no consent field — see Questions).

### i18n
- **Backend**: `apps/api/src/utils/i18n.ts` + `localeFromRequest(req)` (used in `public.router.ts`) localizes on the `Accept-Language` header. Bilingual columns on catalog/service/package rows.
- **Portal**: a **custom cookie-based** locale, NOT `next-intl` and NOT URL-prefixed. `customer-portal/src/lib/locale.ts` → `LOCALE_COOKIE="locale"`, values `"en" | "es"`, `DEFAULT_LOCALE="es"`; `use-locale.ts` is a `useSyncExternalStore` hook; `locale-toggle.tsx` is the switcher; `t(locale, key)` in `lib/messages.ts` returns strings. `acceptLanguage()` maps `es → es-MX` for API calls.
- **There are NO `/en` and `/es-MX` route segments.** Routes are flat (`app/about`, `app/services`, …). This **contradicts the spec's `/es-MX/aviso-de-privacidad` and `/en/privacy-policy` URLs** — see Question Q4.
- **Admin**: no i18n mechanism found (strings in code).

### Revalidation / webhook
- **None.** No on-demand revalidation route in `customer-portal`, no HMAC webhook, no `revalidatePath`/`revalidateTag` usage found. NET-NEW.

### Error envelope (REUSABLE)
- `apps/api/src/utils/http-error.ts`: single `AppError(code, httpStatus, message, details?)` + `HttpError` subclass; `STATUS_TO_CODE` map. Success shape `{ success, data, message }` (`utils/response.ts`). Error shape `{ success:false, error, code }` (per CLAUDE.md). Error handler: `apps/api/src/middleware/errorHandler.ts`. Validation via Zod `middleware/validate.ts`. **Use this for all new endpoints.**

### CI workflows
- `constDocManagment/.github/workflows/ci.yml` — one job (`api`), Node 20, `npm ci → typecheck → typecheck:test → test → build`. **No lint** (no lint script in `apps/api`, per CLAUDE.md), **no security scanning, no Docker build, no deploy, no service containers, no `npm run smoke` in CI.**
- `admin-frontend` and `customer-portal`: **no workflows** (only `.github/instructions/nextjs.instructions.md`).

### Dockerfiles
- `apps/api/Dockerfile` + `apps/worker/Dockerfile`: multi-stage (base→deps→development/builder→production), `node:20-alpine`, `tini` as PID 1, **non-root `USER node`**, `--omit=dev` in production, `/app/storage` pre-chowned. **Base image is a floating tag `node:20-alpine` (no digest pin).**
- `nginx/Dockerfile`: `FROM nginx:alpine` + copies `nginx.conf`. Floating tag.
- **Neither frontend has a Dockerfile.** `output: "standalone"` is NOT configured (UNVERIFIED on next.config — to confirm in Phase 4).

### Compose files
- `compose.yml` (dev): api/worker/postgres/redis, nginx behind a `proxy` profile; Postgres/Redis bound to `127.0.0.1` on non-default host ports; source-mounted hot reload; healthchecks on api/postgres/redis.
- `compose.prod.yml`: nginx (publishes 80/443) + api + worker + postgres + redis. **Only nginx publishes externally** ✅. `restart: unless-stopped` ✅. Healthchecks on api/postgres/redis. **Gaps vs spec:** API also publishes `${API_PORT:-3001}` to host; **worker has no healthcheck**; no `cap_drop`/`no-new-privileges`/`read_only`/tmpfs; no resource limits; no log rotation; Redis has `requirepass` via `redis.conf` (UNVERIFIED — `docker/redis/redis.conf` not yet read); no pg backup-to-S3 job in compose (a `backup.cron.ts` exists in the worker, see below); the two Next apps are **not** services.

### nginx config
- `nginx/nginx.conf`: single `server_name localhost` on :80, `/api/` proxied with a rate-limit zone (100 r/m, burst 20) and 26 MB body cap, `/health` passthrough. **TLS block is commented out**; no per-host blocks (apex/admin/api), no HSTS/security headers, `server_tokens` not set, no gzip/brotli. Clearly a launch TODO (comments say so).

### Worker (relevant to variants + backups)
- BullMQ queues/processors exist: `queues/{document,email,renewal}.queue.ts`, `processors/{document,email,renewal}.processor.ts`; crons `crons/{backup,expiry,renewal}.cron.ts` (so a **backup cron already exists** — read it in Phase 4 before designing pg backup). `worker.ts` is the entry. Email templates include EN + es-MX variants for some messages.

---

## b) Reusable endpoints & components (paths)

**Backend (reuse, don't reinvent):**
- Error envelope: `apps/api/src/utils/http-error.ts`, `utils/response.ts`, `middleware/errorHandler.ts`, `middleware/validate.ts`.
- Auth/roles: `middleware/authenticate.ts`, `middleware/authorize.ts` (`STAFF_ROLES`, `UserRole`), `middleware/account-status.ts`, `middleware/request-id.ts`.
- Settings KV: `entities/app-setting.entity.ts` + admin settings routes/schemas in `modules/admin/admin-pricing.*`.
- Upload pipeline: `utils/s3.ts` (`createUploadPost`, `headObject`, `getObjectRange`, `saveCatalogObject`, `putObject`), `utils/magic-bytes.ts`, `modules/documents/upload-constraints.ts`, intent/confirm pattern in `modules/documents/document.router.ts`.
- Public read surface to extend: `modules/public/public.router.ts` (`/public/site-config`, `/categories`, `/services`, `/packages`, …) — add `/public/hero` and `/public/content` here. Admin surface: `modules/admin/admin.router.ts` (mounted behind `authorize(Admin)` in `app.ts`).
- i18n: `utils/i18n.ts` + `localeFromRequest`.

**Admin frontend (reuse):**
- Route groups `(admin)/admin/*` (add `homepage` + `content`), existing `settings` page as a pattern. Shared `components/ui/*` (radix), `components/pricing/*`, `lib/*` api client. recharts available.

**Customer portal (reuse):**
- `components/home/hero.tsx` (replace internals with carousel), `lib/{locale,use-locale,messages,api,public-api}.ts`, `components/locale-toggle.tsx`, `components/upload-dropzone.tsx`, `data/site-images.ts` (static fallback), `app/sitemap.ts`, `app/manifest.ts`, `components/seo/json-ld.tsx`, `components/public-footer.tsx` (footer link).

---

## c) Task list (each < 2 h) and which phases apply

All three phases apply (backend + both frontends are present). Verification commands per CLAUDE.md: backend gate = `npm run typecheck && npm run typecheck:test && npm test` in `apps/api`, **plus `npm run smoke`** against a real Postgres (the authoritative gate); frontends = `npx tsc --noEmit && npm run lint && npm test && npm run build`. Run frontend chains **one at a time** (portal CLAUDE.md warns of OOM).

### Phase 1 — Backend (constDocManagment / apps/api)
1. Migration `…-HeroSlides.ts` + `entities/hero-slide.entity.ts` (literal DDL per CLAUDE.md drift rule). *Verify:* `docker compose exec api npm run db:migrate`; graphify drift check.
2. Migration `…-SiteContent.ts` + `entities/site-content.entity.ts` (key, locale, value, status, version, updated_by). *Verify:* db:migrate + drift.
3. CMS settings: whitelist new keys in the existing app_settings schema (hero_autoplay, hero_default_duration_ms, hero_transition_ms, hero_pause_on_hover, hero_loop, heading_font, body_font, base_text_scale). *Verify:* unit test on schema.
4. New module `modules/cms/*`: admin CRUD + reorder + toggle for hero slides; GET/PUT settings; content GET/PUT/publish/history; typed content-key registry with per-key max length + sanitizer. *Verify:* jest (validation, 403 non-admin, sanitize) + smoke step.
5. Public `GET /public/hero?locale=` and `GET /public/content?locale=` (active + in-schedule only, ETag, 60 s cache). *Verify:* smoke + curl.
6. Image upload for hero: reuse `createUploadPost` into a dedicated **public** prefix (e.g. `public/hero/`); magic-byte confirm; (variants: see Q3). *Verify:* smoke upload path.
7. Signed HMAC revalidation webhook to the portal on any CMS change (secret from env, timing-safe). *Verify:* unit test on signer.
8. Privacy content as CMS keys + `privacy_policy_version` + effective date; store `accepted_version`+timestamp at registration/onboarding. *Verify:* smoke. Update `docs/api-surface.md`.

### Phase 2 — Admin UI (admin-frontend)
9. `(admin)/admin/homepage` — slide list (thumbnails, drag reorder, active toggle, edit/delete-with-confirm), add/edit dialog (dropzone w/ progress+retry, EN/ES tabs, duration slider, transition select, overlay slider, focal-point picker, schedule), global timing settings, **live preview** reusing the portal carousel, draft/publish, unsaved-changes guard. *Verify:* `vitest run` + build.
10. `(admin)/admin/content` — registered keys grouped by page, EN/ES side-by-side, counter, font/size selectors w/ live preview, draft/publish, history. Privacy editor reuses it. *Verify:* vitest + build.

### Phase 3 — Customer portal (customer-portal)
11. `HeroCarousel` reusing `GET /public/hero` — per-slide duration, configured transition (opacity/transform only), pause on hover/focus + visible button, arrows/dots/swipe, aria-roledescription, `prefers-reduced-motion` disables autoplay, first image `priority` + rest lazy, responsive `srcset`, zero CLS, static fallback. *Verify:* build + Lighthouse mobile ≥ 85 / CLS 0.
12. Headlines/texts from CMS with font/size options via `next/font` allow-list; static defaults on API failure. *Verify:* build.
13. Privacy page(s) from CMS with TEMPLATE structure + `[LEGAL_REVIEW_REQUIRED]` + `[CLIENT_TO_CONFIRM]` placeholders; footer link; sitemap entry; consent checkbox w/ stored version. **Routing depends on Q4.** *Verify:* build.
14. On-demand revalidation route guarded by HMAC (timing-safe). *Verify:* build + manual.

### Phase 4 — Security scan + DevSecOps + prod Docker (constDocManagment owns compose/nginx)
15. Run scans (npm audit, gitleaks, Semgrep, Hadolint, Trivy fs/image) — what's installable; findings table. *Verify:* command outputs captured.
16. Per-repo CI (PR gate + security jobs; backend adds Postgres/Redis service containers + migrate + `npm run smoke`; main → Buildx image + Trivy + SBOM + ECR via OIDC + SHA tags; staging deploy via SSM; prod manual approval; ZAP baseline; Dependabot). *Verify:* `actionlint` if available.
17. Prod Docker hardening (digest-pin bases, worker healthcheck, drop API host port, cap_drop/no-new-privileges/read_only+tmpfs, resource limits, log rotation, pg backup-to-S3 + tested restore) and nginx per-host TLS/HSTS/headers/gzip. Add the two Next apps as `output: "standalone"` services. *Verify:* `docker compose -f compose.prod.yml config`; build.
18. `docs/devsecops.md` + secret-name inventory (no values) + posture report.

---

## Decisions resolved (2026-10-25, by the client)
- **Q2 → Public S3 prefix.** Hero images go to a dedicated `public/hero/` prefix on the existing public-object bucket (reusing `saveCatalogObject`/`createUploadPost`). Never the private documents bucket. CloudFront deferred.
- **Q3 → Original + `next/image`.** No `sharp` this pass. Upload the original; serve responsive `srcset` via `next/image`. Sharp variant worker is a documented fast-follow.
- **Q4 → Single cookie-locale route.** Privacy page is one route rendering the active cookie locale (e.g. `/aviso-de-privacidad`), matching the existing i18n model + `hreflang` alternates. No `next-intl` URL routing.
- **Q5 → Fonts from `docs/design-tokens.md`.** Build the heading/body allow-list from the families already in the design system (+ Inter fallback); read that file before Phase 2/3.
- **Q1 → assumed yes** (workspace's 3 repos = the project; phases run back-to-back) unless told otherwise.

## d) Questions (R6 — each with my recommended default)

**Q1 — Scope across 3 repos.** The spec is written per-repo, but all three repos sit in this one workspace. I propose to run Phase 1 (backend), Phase 2 (admin-frontend), Phase 3 (customer-portal), Phase 4 (backend infra) **back-to-back across the three local repos**, committing per repo. *Default: yes, treat the workspace as the project.*

**Q2 — Public image hosting: public S3 bucket vs CloudFront.** The spec says to ask. Today `saveCatalogObject` writes public catalog images straight to `https://{bucket}.s3.{region}.amazonaws.com/...` (so the bucket already serves public objects for catalog). *Default: reuse that exact pattern for hero in a dedicated `public/hero/` prefix (fastest, no new infra). Add CloudFront later if you want a CDN/custom domain.* — confirm, since the brief also mentions a "private documents bucket"; I must not put public hero images in the documents bucket.

**Q3 — Image variants (sharp).** The spec wants the worker to generate 640/1280/1920 AVIF/WebP with `sharp`. `sharp` is **not** installed and no variant pipeline exists; adding it is net-new (new dep + a BullMQ job). For a *fast* launch I can skip server-side variants and ship the original + responsive `srcset`/`next/image` sizing instead. *Default: ship original + `next/image` responsive now; add the sharp variant worker as a fast-follow.* Say "full sharp pipeline" if you want it in this pass.

**Q4 — Privacy-page routing / i18n model.** The app has **no `/en` `/es-MX` URL routing** — locale is a cookie (`es` default). The spec's literal `/es-MX/aviso-de-privacidad` + `/en/privacy-policy` URLs don't fit. *Default: one route per document that renders both-language content from the active cookie locale (e.g. `/aviso-de-privacidad`), matching the existing pattern; add `hreflang` via query/alternate.* Alternative = introduce `next-intl` URL-prefixed routing (larger, riskier change) — not recommended before launch.

**Q5 — Font allow-list for the CMS.** The spec proposes Roboto Condensed / Inter / DM Sans, but the real fonts come from `docs/design-tokens.md` (extracted from the STO/Turner references). *Default: build the heading/body font allow-list from whatever `docs/design-tokens.md` already defines (loaded via `next/font`), plus Inter as a safe fallback — I'll read that file and list the exact families before building Phase 2/3.* Confirm or give me the 2–3 families you want.

---

## R8 phase report
- **DONE (Phase 0 only):** this file (`docs/phase0-cms-devsecops.md`) — read-only discovery with cited paths.
- **VERIFIED BY:** directory listings + file reads cited inline. No build/test/scan commands were run → every verification column is **NOT RUN** (Phase 0 is read-only).
- **NOT DONE:** all code (Phases 1–4) — awaiting "go".
- **ASSUMPTIONS:** workspace = the three local repos; existing error envelope, auth middleware, `app_settings` KV and `s3.ts` upload pipeline are the intended reuse points; CMS content is sanitized plain/restricted text, never raw HTML (per AGENT.md security rules).
- **QUESTIONS:** Q1–Q5 above.
- **NEXT:** on your answers + "go", run Phase 1 → 4 across the repos back-to-back, stopping only on a blocker (FAST MODE).
