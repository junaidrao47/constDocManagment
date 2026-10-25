# Design Tokens — Grupo G2H

> Extracted 2026-10-25 via Playwright `getComputedStyle` on the two reference sites (STYLE only, nothing copied),
> reconciled with the existing design system in `customer-portal/src/app/globals.css`.

## Reference-site typography (measured, not guessed)
### turnerconstruction.com/who-we-are
- Display H1: **Apercu** (`apercu-extralight-pro`), ~46px, **weight 300**, letter-spacing **-0.70px** (tight), white on dark.
- Eyebrow / small H2: **Apercu Bold** (`apercu-bold-pro`), 13px, **UPPERCASE**, letter-spacing +0.78px.
- Read: airy, enterprise, *light* large headings with tight tracking; bold uppercase micro-labels.
- Apercu is **paid** → closest free Google Fonts: **Hanken Grotesk**, **Inter Tight**, or **Work Sans** (use a light/ 300 weight for display).

### stobuildinggroup.com/contact-us/
- H1: **Source Sans Pro**, 28px, **weight 700**, **UPPERCASE**.
- Eyebrow H2: **Roboto**, 700, letter-spacing **4px**, white.
- Body: **Roboto**, 15px.
- Form inputs: **sharp corners** (`border-radius: 0`), dark field bg `#252525`, white border — a bold, industrial contact section.
- Both faces are **free on Google Fonts**.

## Current Grupo G2H tokens (globals.css — in use)
- **Body font:** Inter (`--font-body`). **Headings:** Roboto Condensed (`--font-heading-face`), weight 700, tracking +0.01em. Mono: Geist Mono.
- **Brand palette:** ink `#15171a`, graphite `#2b2f33`, steel `#8a9099`, concrete `#eceae6` (page bg), paper `#ffffff`, **accent `#e8590c`** (hover `#c94a08`).
- **Semantic:** destructive `#b42318`, success `#067647`, warning `#b54708`, border/input `#d9d6cf`, muted-fg `#5c6066`.
- **Radii:** 6 / 12 / 20px. **Elevation:** 4-step soft shadow scale. **Motion:** 150/300/600ms, ease `cubic-bezier(0.2,0.7,0.2,1)`.
- **Eyebrow pattern** already present (`.eyebrow`): uppercase, ~0.18em tracking, small — matches both references.

## Recommendation
The current **Roboto Condensed heading + Inter body** already matches the references' "bold grotesque heading + clean sans body"
direction, and the accent orange echoes the orange arrow accents seen in both menus. **Keep as the default.**
Offer alternates through the CMS font setting (W4) from this fixed allow-list (all Google Fonts, license-safe):

- **Heading allow-list:** Roboto Condensed *(default)*, Oswald, Archivo, Hanken Grotesk, Inter Tight.
- **Body allow-list:** Inter *(default)*, Source Sans 3, Roboto, Public Sans.
- **Base text-size scale:** `--step` multiplier (0.95 / 1.0 / 1.05 / 1.1) applied to the type scale, CMS-selectable.
- **Accent:** chosen from the token set (default `#e8590c`); do not allow arbitrary hex.

## Layout patterns to adopt (from scan — see docs/research/market-notes.md)
- Category-grouped **mega-menu** (both sites).
- **Text-led hero** with a strong statement + primary CTA (Turner) — already implemented.
- **Bold lead-in paragraphs** on About; vertical sub-topic link list.
- Contact: topic dropdown + HQ block with phone/"Llamar".
