# PROJECT BRIEF — Grupo G2H Servicios Integrales

> Single source of truth for Claude Code. Read this file fully before any task.
> If this file conflicts with the signed scope (`docs/scope-v1.0.md`), the signed scope wins; flag the conflict to me.
> Always verify claims against the real code, never against READMEs or older docs.

---

## 1. Who and what

- **Client / brand name**: **Grupo G2H** — tagline **Servicios Integrales** (extracted from the client's logo). Use this name everywhere: `<title>`, favicon, OG tags, header, footer, login pages, email templates, PDF quotations, README. Keep it in ONE constant (`brand.ts`) per app.
- **Client**: Mexican business (customers in Mexico, including the Veracruz/Xalapa area). Currency is **MXN**.
- **Languages**: **English and Mexican Spanish (es-MX)**, fully bilingual: UI, emails, PDFs, validation messages, and database-managed content (services, packages).
- **Developer**: Muhammad, sole developer, working under the brand MJPRODS. Contract is signed. Quality bar: this is a ~$100K-value business system, so senior-level design, backend and security.
- **Product in one paragraph**: a site that helps local people and companies get their documents approved by the government. A customer buys a package, uploads documents in the customer portal, admin and managers review them, staff take them to the government for approval, then upload the approved versions so the customer can see and download them in the portal.

## 2. Repositories (github.com/junaidrao47)

| Repo | Contents | Stack |
|---|---|---|
| `constDocManagment` | Backend: `apps/api` (Express + TypeORM REST API), `apps/worker` (email/cron/queue worker), nginx, Docker, docs | Node.js, Express, TypeScript, TypeORM, PostgreSQL, Redis, S3, SES |
| `constDocAdmin` | Admin + staff (agent/manager) portal, port 3001-ish | Next.js (App Router), TypeScript, Tailwind, vitest |
| `constdoc-customer-portal` | Public marketing website + authenticated customer portal, port 3002 | Next.js 16, React 19, Tailwind, TanStack Query, React Hook Form + Zod, next-themes, sonner |

- Backend is a **modular monolith**: modules `admin, agent, assignments, auth, catalog, customers, documents, manager, notifications, packages, payments, public, quotations, subscriptions, users`. Do NOT split into microservices.
- Auth is **Bearer-token** (`accessToken` + `refreshToken` in JSON body, `Authorization: Bearer`, refresh-on-401). The signed scope mentions HTTP-only cookies; this is a known deviation. Do not silently switch; raise it as a decision.
- Roles: `customer | agent | manager | admin`.
- Frontend stack named in scope: Next.js App Router + TypeScript + Tailwind + shadcn/ui, with TanStack Query and React Hook Form + Zod.
- Existing docs in backend `docs/`: `api-surface.md`, `delivery-plan.md` (stale, dated 2026-09-03), `build-audit-2026-10-14.md`, `client-decisions.md`, `decision-log.md`. Also `tasks/` (single-PR task files), `AGENT.md`, `CLAUDE.md`.
- `npm run smoke` (`apps/api/src/scripts/smoke.ts`) is the **authoritative gate** and delivery scoreboard. Jest tests use in-memory fakes and have already hidden production bugs. A green `npm test` does NOT prove persistence works.

## 3. Signed scope (MJPRODS Requirements & Scope v1.0, Final)

**Modules**: public business website, customer portal, admin dashboard, agent/manager portal, dynamic quotation + pricing calculator, services and packages management, document management with approval workflow, subscription management, invoice + payment management, automated email notifications, renewal/expiry reminders, responsive design.

**Public website pages**: Home, About, Services, Packages, Contact, FAQs, customer reviews, CTAs, basic SEO.

**Pricing calculator** (DB-driven, never hardcoded): inputs = industry, state, city, worker count, services/package. All rules (worker-based pricing, location multipliers, city charges, service charges, packages, quotation validity) are admin-configurable and stored in the DB. Current backend formula: workerRanges x location multiplier + service charges + city fee.

**Customer portal**: dashboard, active services/subscriptions, document upload/download, document status tracking (Pending / Under Review / Approved / Rejected / Expiring Soon), quotations / invoices / payment history, renewal notifications.

**Status sets (every change must notify the relevant customer/agent)**:
- Quotations: Draft, Sent, Under Review, Accepted, Rejected, Expired
- Invoices: Pending, Paid, Overdue, Cancelled
- Subscriptions: Active, Renewal Due, Expiring Soon, Expired, Cancelled
- Payments: Pending, Confirmed, Failed
- Documents: Pending, Under Review, Approved, Rejected, Expiring Soon

**Admin dashboard manages**: customers, agents, managers, services, packages, pricing rules, quotations, documents, subscriptions, invoices, payments, notifications, customer activity.

**Agent/manager portal**: role-based access to ASSIGNED customers, document review/approve/reject, service progress tracking.

**Automated emails required**: registration, password reset, quotation notification, document approval/rejection, payment confirmation, invoice notification, subscription renewal, document/quotation expiry.

**Deferred / optional**: payment gateway depends on client's region and business account (online gateway is **still in scope**; code drifted to offline-only). WhatsApp API is an optional future add-on (a plain click-to-chat link is fine).

**Out of scope unless separately quoted**: new major modules, major workflow changes, extra third-party integrations, mobile apps, anything outside the scope doc. The `catalog` module is treated as unscoped extra work.

**Delivery**: 8 weeks max from the baseline, with a review period for bug fixes and minor UI adjustments afterward. Client has a "Client Requirements Clarification: Completed Working Specification" (3 Oct 2026, EN + ES-MX) that is part of the scope baseline.

## 4. New client instructions (latest)

1. **Design references** (design must be similar):
   - `https://stobuildinggroup.com`: use for the top categories/navigation AND fonts.
   - `https://www.turnerconstruction.com/who-we-are`: use as the page layout/style model.
   - Do not copy their images or text. Extract fonts, sizes, colors and spacing with the Playwright MCP (`getComputedStyle`) into `docs/design-tokens.md`, then build tokens from that. If a font is paid, pick the closest Google Font and tell me.
2. **Contact system** like Turner's panel: first name, last name, email, optional phone, message, reCAPTCHA notice. It must store the message and email the client.
3. **Client logos strip**: about 60 logos of companies the client has worked with (Mexican/Veracruz brands), shown with animation (see 7.4).
4. **Brand**: Grupo G2H / Servicios Integrales everywhere.
5. **Bilingual**: English + es-MX.
6. **Security is very important.** Emails must be automated. Deploy everything on **AWS EC2**, dockerized, with the client's **domain** attached.
7. **Timeline**: roughly 2 days remain to deploy a convincing, demoable build.

## 5. Known state and gaps (verify before trusting; these come from earlier audits)

- Backend real end to end: auth (register/login/refresh/reset), documents workflow (upload/download/status/audit), quotations (create, list/get, status flow, history, PDF export, email on Sent), admin user management, agent/manager review queues, public catalog + calculator (`/api/public/*`).
- Backend gaps historically: `packages`, `subscriptions`, `payments`, invoices, several admin endpoints (pricing-config write, analytics, subscription oversight), agent-to-customer assignment, worker crons (expiry, renewal, backup). Re-check each against the code today.
- Security: CORS falls back to `*` if `CORS_ORIGIN` is unset (must fail to boot in production). Helmet, rate limits (global + auth routes) exist. Nginx HTTPS block is commented out; `server_name` is `localhost`.
- Email: 8 templates exist (document approved/rejected, invoice, payment recorded, quotation ready/accepted/rejected, renewal reminder). No Spanish versions. Missing: welcome/verify, password reset, contact received, contact auto-reply, subscription activated/expiring/expired, document received.
- Frontends: customer portal is a single-page marketing site plus working dashboard/documents/quotations/billing (read-only). Admin has dashboard, quotations, users, staff customers/documents. No i18n in either app. Portal uses Geist fonts (not the reference fonts). Neither app has a Dockerfile. Missing UI: packages, pricing-config, subscriptions, payments, analytics, contact inbox, testimonials.
- AWS: SES set up in `us-east-1` for `grupog2h.com` (DKIM, MAIL FROM, SPF, DMARC on GoDaddy). SNS bounce/complaint handling and SES production-access request are still pending. S3 for storage. Do not rely on SES delivery to arbitrary addresses until production access is granted.

## 6. Non-negotiable engineering rules

1. **Read real code before claiming status.** Router files are thin; business logic is in `*.service.ts`.
2. **Never wire UI to stub endpoints.** Build the backend first or build a shell clearly marked as a shell.
3. **One task per session, small PR-sized changes.** Plan Mode for anything non-trivial. Conventional commits. Add an entry to `docs/decision-log.md` for any architectural decision.
4. **Prove it works**: typecheck, lint, tests, and `npm run smoke` against a real Postgres via Docker. Never report "done" from mocked tests alone. Say "static only" when unverified.
5. **No hardcoded strings**: all UI text in `messages/en.json` and `messages/es-MX.json`. All money via `Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' })`.
6. **No secrets in git.** Validate env at boot with a schema and refuse to start if required values are missing.
7. **Code readability**: stop writing dense single-line statements; keep normal formatting (Prettier). Do not reformat unrelated files.
8. **Scope control**: if something is not in the scope doc or this brief, ask me before building it. Never delete or rewrite working features without asking.
9. Keep `CLAUDE.md` updated with commands, conventions and gotchas you discover.

## 7. Target deliverables (build in this order)

### 7.1 Foundation (brand, i18n, design system)
- `brand.ts` with name, tagline, contact info placeholders.
- `next-intl` with routes `/en` and `/es-MX` (default `es-MX`), language switcher, `hreflang`. Message files for every page.
- `docs/design-tokens.md` from the two references; Tailwind tokens (colors, fonts, spacing, radii), shared button/card/input components, consistent status badge colors.
- Backend: `preferredLocale` on user; emails and PDFs rendered in that language; bilingual DB fields (`name_en`, `name_es`, `description_en`, `description_es`) for services and packages with both fields in the admin forms.

### 7.2 Public website (customer-portal repo)
Header (logo, STO-style categories/mega-menu, language switcher, Request-quote button, login) → Home with: hero, animated client-logos strip, services grid, 4-step "how it works" (choose package, upload documents, we handle the government process, download approved), packages teaser fed from the API, pricing calculator, stats counters, testimonials, FAQ, final CTA → Footer. Pages: Home, About (Turner "Who we are" style), Services (+ detail), Packages (+ detail), Contact, FAQ, Privacy notice (Aviso de Privacidad), Terms, Cookies. SEO: titles/descriptions, sitemap, robots, Open Graph, JSON-LD. Lighthouse target above 90, mobile-first, accessible.

### 7.3 Contact system
- Frontend form (first name, last name, email, optional phone, message) with Zod validation in both languages, reCAPTCHA v3 or Cloudflare Turnstile, honeypot.
- `POST /api/public/contact`: validate, rate-limit, verify captcha, save to `contact_messages` (status new/read/replied), enqueue two emails via the existing email queue: one to the client inbox (Reply-To = sender) and an auto-reply to the sender in their language.
- Admin "Messages" inbox page with status changes.

### 7.4 Client logos strip
Two-row infinite CSS marquee, opposite directions, grayscale by default and colored on hover, pause on hover, respects `prefers-reduced-motion`, lazy loaded with `next/image`. Logos live in `public/clients/` (one file each, uniform height, transparent/white background). Titled "Companies that trust us" / "Empresas que confían en nosotros". Data-driven from a JSON list (later admin-managed).

### 7.5 Packages and commerce loop (core of the 60-70% milestone)
Admin creates detailed services and packages with full CRUD (bilingual, ordering, publish toggle) → packages shown on the public site and used by the calculator → customer requests a quotation or buys a package → payment (online gateway if the client has chosen one, else offline flow with admin confirmation) → subscription activated → customer uploads documents → agent/manager reviews (approve/reject with reason, version history, required-documents checklist) → approved versions uploaded back → customer downloads. Agents see only assigned customers.

### 7.6 Admin portal
Sidebar layout, Cmd+K search, breadcrumbs. Dashboard KPIs (revenue MXN, active subscriptions, pending documents, open quotations, new customers, overdue invoices), charts (revenue, quotation funnel, documents by status), and a "needs attention" queue. Modules: customers (detail timeline), staff and assignments, services and packages, pricing rules (editable, with calculator preview), quotations/invoices/payments, documents oversight, subscriptions, contact messages, testimonials/FAQs/logos content, email log, reports (CSV), audit log, settings. Data tables with server-side pagination, sort, filter, export. Skeletons, empty states, error states, toasts, confirm dialogs, dark mode, role-based menus.

### 7.7 Email automation
Shared branded layout (logo, footer, EN + ES-MX, plain-text fallback). All templates in section 5 plus those required by scope. Queue + processor with retries. Crons for expiry and renewal reminders must actually work. SNS bounce/complaint handling with suppression list.

### 7.8 Security checklist (must pass before deploy)
- Production boot fails without `CORS_ORIGIN`, JWT secrets, DB and Redis URLs. Strong secrets, short-lived access tokens.
- Security headers on the Next apps (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy). Avoid `dangerouslySetInnerHTML`.
- Uploads: MIME allowlist, size limits, magic-byte check, random filenames, private S3 bucket, presigned URLs.
- Authorization tests: customer A cannot access customer B's documents, quotations or invoices (IDOR); every route enforces roles; agents limited to assigned customers.
- Lockout/rate limits on auth, audit log for admin actions, `npm audit` clean of high/critical.
- Input validation (Zod) on every route; no raw SQL string concatenation.
- Server: security group exposes only 80/443 (SSH from my IP or SSM); Postgres and Redis unpublished; IAM role for S3/SES instead of keys; `.env` chmod 600; nightly `pg_dump` to S3; EBS snapshots; unattended upgrades.

### 7.9 Deployment (AWS EC2, Docker)
- Multi-stage Dockerfiles with `output: "standalone"` for both Next apps; add them to `compose.prod.yml` beside nginx, api, worker, postgres, redis.
- Hostnames: apex + `www` (public site + customer portal), `admin.` (admin/staff), `api.` (backend). DNS at GoDaddy to an Elastic IP.
- nginx: server blocks per host, HTTPS via certbot/Let's Encrypt, HTTP to HTTPS redirect, HSTS.
- Build images in CI (GitHub Actions) and push to ECR, or build on the box with swap. Instance at least t3.medium.
- Post-deploy: run migrations, run `npm run smoke` against production, `/health` monitoring, error tracking (Sentry), seed demo data for the client walkthrough.

## 8. Open questions for the client (ask me, don't assume)
Which payment gateway (Stripe / Mercado Pago / other) or offline for now? Real logo files in SVG/PNG? Real photos and team images? Final company contact details and the inbox that should receive contact messages? Text for the Aviso de Privacidad and Terms? Real services, packages and pricing rules, and the list of documents required per service? Confirmation that the client's customers' logos may be displayed? Final domain name?

## 9. First thing to do in a new session
1. Read this file, `CLAUDE.md`, `AGENT.md`, `docs/decision-log.md`, `docs/client-decisions.md`.
2. Confirm `docs/scope-v1.0.md` exists; if not, tell me and continue with this brief.
3. Run the audit (read-only) described in the kickoff prompt, then wait for my approval before building.
## 10. Decisions made 2026-10-20 (override anything above that conflicts)

1. **Categories**: a new `categories` entity. Every service and every package has exactly ONE required category.
   Admin must create a category before creating a service or package. Public cards show the category.
2. **Documents**: upload is available to BOTH the customer and staff (agent/manager), who can upload on a customer's behalf and upload the official approved file. Both sides can see the status and timeline of every document.
3. **Statuses are expected to change** after the client's feedback on the first delivery. Therefore keep document statuses and allowed transitions in ONE backend module and expose them to the frontends through an API. No frontend file may hardcode a status list, label or transition.
4. **Upload entitlement**: a customer may upload documents only after buying/accepting a package or quotation. Implement it behind a single function `canUploadDocuments(customer, serviceOrPackage)` that returns true for now, so the rule can be tightened after client feedback.
5. **Required documents checklist** per service: managed in admin, shown to the customer, with a progress indicator.
6. **Resubmission**: after a rejection the customer uploads a new VERSION. History is never overwritten.
7. **Email automation control panel (rules, sender choice, auto/manual mode, time control, sent-email log screens) is DEFERRED** until after the first delivery. Do NOT build it now. Keep sending emails through the existing queue/`notify()` so it can be added later.
8. **Quality bar**: consistent error handling everywhere (see Prompt A). Every list/detail screen has loading, empty and error states.