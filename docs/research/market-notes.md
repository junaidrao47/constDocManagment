# Market & Design Research (W7)

> Research only — no code. Proposals are labelled **PROPOSAL** for client approval and are **not** presented as facts.
> Each external claim links a source with a confidence level. Reference sites scanned for **structure/typography only**
> (no text or images copied). Scanned 2026-10-25.

## 1. Reference-site structural scan (STYLE only)

### turnerconstruction.com/who-we-are
- **Nav:** logo top-left (light/dark variants); top-level categories **Our Company · Our Services · Our Projects · News & Insights · Careers · Contact Us**; mega-menu with grouped sub-links, a featured image tile, and a prominent button ("Become a Subcontractor"); search field.
- **Hero:** *text-led*, not a full-bleed image — opens with a heading + short statement + CTA button.
- **Section order:** intro block → link-list ("Who We Are / Our Culture / Resources") → promo card → integrated services grid → projects & news (image-over-headline cards, 3-up) → careers block with CTA → contact (form + address + phone) → footer (social, legal, EO statement).
- **"Who we are" pattern:** vertical link list under a heading, then short paragraphs with **bold lead-ins** ("Our Impact") and subsections.
- *Confidence: high (structure); fonts/colors not extractable from text capture — would need Playwright `getComputedStyle` to confirm.*

### stobuildinggroup.com/contact-us/
- **Header:** utility bar (region/office selector, "Subcontractors", search), logo left; main nav **Who We Are · What We Do · People · News · Companies · Contact · Find Us**; dropdowns use title + short blurb + "Learn More >"; uppercase mobile nav.
- **Contact body:** banner image → "Contact Us" heading → HQ block (bold subheading, phone, "Call" link) → "Connect with us" → form.
- **Contact form fields (in order):** First Name, Last Name, Title, Company, Preferred Method of Contact, Telephone, Email, Confirm Email, Message, + a topic dropdown (Business Development, Careers, Press, Marketing, Subcontractors).
- **Footer:** link columns (family of builders, who we are, helpful links, insights, contact w/ dept emails), company blurb, newsletter signup, policy links, social row. Built on WordPress "Onyx" theme.
- *Confidence: high (structure); exact fonts/colors not in capture.*

### Design takeaways for Grupo G2H (PROPOSAL)
1. Adopt a **mega-menu grouped by service category** (like both references) rather than a flat nav — maps cleanly to the category proposals below.
2. A **text-led hero with a strong statement + primary CTA** (Turner pattern) reads more credible/enterprise than a stock-photo hero; keep imagery for category/section cards.
3. "Quiénes somos" page: **bold lead-in paragraphs** + a vertical link list to sub-topics.
4. Contact: richer topic dropdown (ventas / trámites / soporte) + HQ block with phone/"Llamar".
5. Confirm fonts/colors with Playwright `getComputedStyle` before finalising `docs/design-tokens.md` (not yet created).

## 2. Market — service categories in scope (grounded)
Mexican business compliance splits **federal / state / municipal**; the recurring categories:

| Category (PROPOSAL slug) | What it covers | Authorities |
|---|---|---|
| `fiscal` — Fiscal / Tributario | RFC, CFDI e-invoicing, electronic accounting, tax filings | SAT |
| `laboral` — Laboral / IMSS | payroll compliance, benefits, union/STPS matters | IMSS, STPS |
| `ambiental` — Ambiental | environmental permits (new/renewal), inspections, representation on visits | SEMARNAT, PROFEPA |
| `licencias` — Licencias y permisos municipales | uso de suelo, licencia de funcionamiento, protección civil, salubridad, anuncios | Municipio / Estado |
| `apertura` — Apertura de negocio | RFC + acta constitutiva + SARE fast-track (low-risk, ≤72h in some states) | SAT, RPPC, SARE |

Typical required documents (grounded): RFC vigente, autorización de uso de suelo, identificación oficial, croquis del local, dictámenes de protección civil / salubridad when applicable.

## 3. Personas (PROPOSAL — for client approval, not facts)
1. **Dueño de PyME / micronegocio** — opening or regularising a local business; needs licensing + fiscal; price-sensitive, wants speed (SARE) and a clear checklist.
2. **Empresa establecida (mediana/grande)** — recurring multi-category compliance (fiscal + laboral + ambiental); values document tracking, phase visibility, renewal reminders.
3. **Empresa extranjera / manufactura (shelter)** — foreign company needing environmental + labor + fiscal set-up; values English support and representation before authorities.
4. **Profesional independiente / individual** — single permit or document; lightweight, self-serve.

These map to the existing `customer-profile` persona concept (PROJECT-BRIEF §11.2) and should seed the admin-editable persona list.

## 4. Sources
- https://mexico.justia.com/derecho-corporativo/tramites-de-las-empresas/preguntas-y-respuestas-sobre-tramites-de-las-empresas/ — obligations by activity (fiscal/laboral/ambiental). *Confidence: medium (legal blog).*
- https://www.unotv.com/negocios/requisitos-para-abrir-un-negocio-en-estados-de-mexico/ — per-state opening requirements. *Confidence: medium (news).* 
- https://www.milenio.com/comunidad/tramites-y-permisos-para-abrir-un-local-en-tamaulipas — licencia de funcionamiento municipal, plazos/costos. *Confidence: medium (news, 2020-21 figures — verify).* 
- https://www.commenda.io/mexico/best-corporate-compliance-service-providers — corporate compliance categories. *Confidence: low-medium (vendor).* 
- https://www.americanindustriesgroup.com/ — environmental/EOHS & shelter-program categories. *Confidence: low-medium (vendor).* 
- Reference sites (structure only): turnerconstruction.com/who-we-are, stobuildinggroup.com/contact-us/. *Confidence: high for structure.*

> ⚠️ Cost/time figures above change by municipality and year — verify against official SAT / SEMARNAT / IMSS / municipal portals before publishing any number as fact (R3).
