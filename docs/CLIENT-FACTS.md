# CLIENT FACTS — Grupo G2H / Servicios Integrales

> Single source of truth for business facts shown on the public site, in emails, PDFs and structured data.
> **Rule (R3):** nothing here may be invented. Anything not confirmed is `[CLIENT_TO_CONFIRM: …]` and must render
> as a visible placeholder in code, never as a fabricated real value. Demo data is flagged separately (`is_demo`).

## Confirmed (from docs/PROJECT-BRIEF.md)
- **Legal/brand name:** Grupo G2H
- **Tagline:** Servicios Integrales
- **Primary domain:** grupog2h.com (SES verified in us-east-1 per PROJECT-BRIEF §5)
- **Country / market:** Mexico; customers include the Veracruz / Xalapa area (PROJECT-BRIEF §1)
- **Currency:** MXN
- **Languages:** Mexican Spanish (default) + English
- **Product:** helps people/companies get documents approved by the government — buy a package, upload
  documents, managers review in phases, staff submit to the authority, approved files returned for download.

## PLACEHOLDERS — client must confirm before go-live
- `[CLIENT_TO_CONFIRM: legal entity name / RFC]` — full registered name for invoices/contracts.
- `[CLIENT_TO_CONFIRM: street address]` — physical address for LocalBusiness schema + footer.
- `[CLIENT_TO_CONFIRM: primary phone]` — the contact page currently shows the demo number `+52 55 1234 5678`.
- `[CLIENT_TO_CONFIRM: contact inbox]` — using `contacto@grupog2h.com` (brand domain) until confirmed.
- `[CLIENT_TO_CONFIRM: business hours]`
- `[CLIENT_TO_CONFIRM: years in business / founded year]`
- `[CLIENT_TO_CONFIRM: real customer count / projects]` — no counts shown as fact; stats band uses labelled demo/illustrative figures only.
  ⚠️ The home hero panel currently shows **"+60 empresas atendidas"** (pre-existing copy in `messages.ts`, `home.hero` chips) — treat as illustrative until the client confirms a real figure; aligns with the "~60 client logos" concept in PROJECT-BRIEF §4.3.
- `[CLIENT_TO_CONFIRM: certifications / awards]`
- `[CLIENT_TO_CONFIRM: real testimonials]` — none shown as real until provided.
- `[CLIENT_TO_CONFIRM: Aviso de Privacidad text]`
- `[CLIENT_TO_CONFIRM: Terms text]`
- `[CLIENT_TO_CONFIRM: real service list, packages and pricing rules]`
- `[CLIENT_TO_CONFIRM: company logo files in SVG/PNG]` — a vectorised cube mark exists in `brand-logo.tsx`.
- `[CLIENT_TO_CONFIRM: social profile URLs]` — for Organization `sameAs`.

## Notes
- SES production access was still pending (PROJECT-BRIEF §5) — do not rely on delivery to arbitrary inboxes.
- Locations CDMX / Monterrey / Guadalajara are **seed/demo** values, not a confirmed office list.
