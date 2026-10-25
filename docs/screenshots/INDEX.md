# Screenshots (demo data walkthrough)

Captured 2026-10-25 against the live stack with the W1 demo data seeded. 1280px viewport.

| File | Role | URL | What to look for |
|---|---|---|---|
| `public/home.png` | public | `:3002/` | Hero with real Mexico-City photo, Spanish-first headline, glass stat panel. |
| `staff/my-customers.png` | manager (`manager1@demo.g2h.test`) | `:3000/customers` | "My Customers" — 2 assigned demo customers with phase-progress bars (Construcciones del Golfo 3/5·60%, Juan Pérez 0/1). |
| `customer/dashboard.png` | customer (`cliente1@demo.g2h.test`) | `:3002/dashboard` | es-MX dashboard: assigned manager (Mariana), active subscription, 3 documents across statuses (Aprobado/En revisión/Por vencer) with phase progress. Header now "Grupo G2H". |
| `admin/calculator.png` | admin (`admin@demo.g2h.test`) | `:3000/admin/calculator` | W3 estimation calculator: editable worker ranges / locations / industries / quote settings, with a live estimate panel. Shown: Construction + CDMX + 10 workers + 2 services → worker base $15,000 ×1.15 + $25,000 + $9,000 + city fee $3,500 = **$54,750 MXN**, computed live against `POST /public/quotations/calculate`. |
| `admin/dashboard.png` | admin (`admin@demo.g2h.test`) | `:3000/admin` | Dashboard KPIs from the real `/admin/analytics/overview`: revenue $747,348 (30d), 18 customers (16 approved), 1 pending approval, 10 docs in review, documents-waiting-per-manager, new customers, quick links. |
| `public/offer-bar-home.png` | public | `:3002/` | Admin-toggled announcement bar above the navbar: "Launch offer: 15% off new compliance packages →" (EN), linking to `/packages`. Controlled from `/admin/settings`. |

Credentials: `docs/DEMO-ACCOUNTS.md` (all `Demo1234!`). More pages can be captured on request (W2).
