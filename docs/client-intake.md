# Client Intake — information needed before go-live

**Grupo G2H / Servicios Integrales**

This is everything the client must confirm before the website launches publicly. Each item
below currently shows a **visible placeholder** in the site/app (never a fake value), so the
site can run for a demo, but these must be filled with real values before a public launch.

Grouped by topic. For each: *what we need* and *where it appears*. Send this list to the
client; fill the "Client answer" blanks and return it. (An es-MX version can be produced on
request — the client is in Mexico.)

> Not needed yet: **email production access**. Email stays in AWS SES *sandbox* until the site
> is live; the bounce/complaint + suppression handling is already built, and production access
> is requested from AWS after launch. No client input required for that now.

---

## 1. Legal & business identity
Used on invoices, contracts, the website footer, and the structured data (LocalBusiness/Organization) that search engines read.

| # | What we need | Where it appears | Client answer |
|---|---|---|---|
| 1 | **Full registered legal name + RFC** | Invoices, contracts, Privacy Notice ("Responsable"), footer | |
| 2 | **Physical/registered address** | Footer, LocalBusiness schema, Privacy Notice | |
| 3 | **Founded year / years in business** | About page, trust copy | |

## 2. Contact details
| # | What we need | Where it appears | Client answer |
|---|---|---|---|
| 4 | **Primary phone** (currently a demo number `+52 55 1234 5678`) | Contact page, footer | |
| 5 | **Contact inbox** — the address that should **receive website contact-form messages** (currently assumed `contacto@grupog2h.com`) | Contact form delivery, Privacy Notice (ARCO/contact), footer | |
| 6 | **Business hours** | Contact page | |
| 7 | **Social profile URLs** (Facebook / Instagram / LinkedIn, etc.) | Footer, Organization `sameAs` | |

## 3. Trust & proof (only shown if provided — nothing is invented)
| # | What we need | Where it appears | Client answer |
|---|---|---|---|
| 8 | **Real company count / projects figure** — the hero currently shows an illustrative **"+60 empresas atendidas"** | Home hero chip, stats band | |
| 9 | **Client logos** (≈60, as image files) + **written permission to display them** | "Companies that trust us" logo strip | |
| 10 | **Real testimonials/reviews** (name, role, text; permission to publish) | Testimonials section | |
| 11 | **Certifications / awards** (if any) | About / trust sections | |

## 4. Brand assets
| # | What we need | Where it appears | Client answer |
|---|---|---|---|
| 12 | **Official logo files** in SVG and/or PNG (a placeholder cube mark is in use) | Header, footer, emails, PDFs, favicon | |
| 13 | **Real photos** (office, team, work) if they want them instead of stock | Home, About | |

## 5. Services, packages & pricing  *(the core of the product)*
| # | What we need | Where it appears | Client answer |
|---|---|---|---|
| 14 | **Real service list** (name EN + es-MX, description) | Services pages, calculator, packages | |
| 15 | **Packages** (what each includes, name EN + es-MX) | Packages pages, calculator | |
| 16 | **Pricing rules** — worker-count tiers, per-state/city multipliers, service charges, quotation validity | Pricing calculator, quotations, invoices (MXN) | |
| 17 | **Required-documents checklist per service** — which documents a customer must upload for each service | Customer portal upload checklist | |

## 6. Legal texts  ⚠️ require a lawyer
The Privacy Notice, Terms and Cookies pages are **structural templates only**. They are **not legally valid** until reviewed/replaced by the client's lawyer — do not treat the current text as compliant.

| # | What we need | Where it appears | Client answer |
|---|---|---|---|
| 18 | **Aviso de Privacidad** — final, lawyer-approved text (EN + es-MX) | `/privacy` | |
| 19 | **Terms & Conditions** — final text (page does not exist yet) | `/terms` (to be built) | |
| 20 | **Cookies policy** — final text (page does not exist yet) | `/cookies` (to be built) | |

## 7. Deployment & operations (from the client/AWS, not public content)
| # | What we need | Why | Client answer |
|---|---|---|---|
| 21 | **Final domain name + DNS access** (GoDaddy) | Point the site/admin/api subdomains at the server; issue HTTPS certificates | |
| 22 | **Payment approach for launch** — offline/manual confirmation (current), or an online gateway (Stripe / Mercado Pago)? | Determines the checkout flow | |
| 23 | *(later, after launch)* **Expected email volume** | Needed for the AWS SES production-access request | |

---

### Already confirmed (no action needed)
Brand name **Grupo G2H** / tagline **Servicios Integrales**; market **Mexico**; currency **MXN**;
languages **es-MX (default) + English**; domain **grupog2h.com** (SES verified). Source:
`docs/PROJECT-BRIEF.md`, tracked in `docs/CLIENT-FACTS.md`.

> As answers come back, record them in `docs/CLIENT-FACTS.md` and replace the matching
> `[CLIENT_TO_CONFIRM: …]` placeholders in the code.
