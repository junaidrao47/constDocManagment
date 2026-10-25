# Demo Accounts (local / staging ONLY)

> Created by `apps/api/src/scripts/seed-demo.ts` (W1). Every row is `is_demo = true` and removable
> with `purge-demo.ts`. **Do not use on production.** Login emails use the reserved `.test` TLD and
> notification emails use `@example.test`, so no mail is ever delivered to a real address.

**Password for every demo account:** `Demo1234!`

## Staff
| Role | Email | Name |
|---|---|---|
| Admin | `admin@demo.g2h.test` | Administrador Demo |
| Manager | `manager1@demo.g2h.test` | Mariana Hernández |
| Manager | `manager2@demo.g2h.test` | Jorge Ramírez |
| Agent | `agent1@demo.g2h.test` | Agente Demo |

## Customers
| Email | Legal name | Persona | Account status | Manager | City |
|---|---|---|---|---|---|
| `cliente1@demo.g2h.test` | Construcciones del Golfo S.A. de C.V. | company | approved | Mariana | Xalapa, Veracruz |
| `cliente2@demo.g2h.test` | Industrias Monterrey S.A. | company | approved | Jorge | Monterrey |
| `cliente3@demo.g2h.test` | Juan Pérez García | individual | approved (EN locale) | Mariana | CDMX |
| `cliente4@demo.g2h.test` | Comercializadora Jalisco S.A. de C.V. | company | **pending_approval** | — | Guadalajara |
| `cliente5@demo.g2h.test` | Negocios Suspendidos S.A. | company | **suspended** | Jorge | CDMX |

## What the data exercises
- **Documents** across every status: approved (+ official file), under_review, expiring_soon, submitted_to_government, rejected, pending — each with phases at different progress.
- **Quotations** (accepted / sent / draft) with line items; **invoices** (2 paid, 1 issued, 1 overdue) and **payments** → demo revenue ≈ **$55,448 MXN**.
- **Subscriptions** (active / expiring_soon). **Manager assignments** + one agent assignment.
- **Catalogue**: 5 categories (`fiscal, laboral, ambiental, licencias, apertura` — match the staged public images), 7 services, 2 packages (bilingual).

## Commands
Run from `apps/api` on the host, **or** inside the container (recommended — matches the live stack):
```
docker compose exec api npx ts-node src/scripts/seed-demo.ts    # seed / refresh (idempotent)
docker compose exec api npx ts-node src/scripts/purge-demo.ts   # remove ALL demo data
```
Host equivalents (npm): `npm run db:seed:demo` · `npm run db:purge:demo`.
Guard: both refuse to run when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`.

> ⚠️ `/api/admin/analytics` is still a **stub** (`"not implemented"`). The demo revenue is in the DB
> (invoices/payments) but will not render in an analytics dashboard until that endpoint is built.
