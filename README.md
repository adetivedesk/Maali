# Maali Civil ERP — Frontend MVP

A frontend prototype for managing civil engineering projects. It covers the full flow from quotation to contract, phases, costs, billing, payments, profit and closure. Data is stored in Neon Postgres through Vercel functions, with a browser-only demo mode as a fallback.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm test           # data-integrity audit, worked examples, money identities, full workflow
npm run figures    # regenerate docs/figures.json after changing the demo seed
```

### Every number is calculated, never typed

- **Seed data:** `src/data/seed.ts` stores only primary facts: line items, invoices, payments and budgets.
- **Audit:** `src/lib/audit.ts` checks that the stored facts agree with the values the calculation layer derives from them:
  - every amount equals quantity × rate or daily rate × days
  - no payment exceeds its invoice
  - each contract value equals the sum of its phases, and each quote equals its project
  - phase statuses match billing
  - dates run in order
- **Tests:** `npm test` fails if the seed breaks any of these rules. It also fails if a workflow action (convert, cost, pay, bill, change order, close) leaves the data inconsistent.
- **Documentation figures:** every figure quoted in documentation comes from `docs/figures.json`. `npm run figures` builds that file from the same calculation code the app uses, and a test fails if it is stale.
- **As-of date:** overdue status depends on the date, so the demo is pinned to an **as-of date of 04-Oct-2026**, shown in the header. This keeps the figures stable over time. Set `VITE_AS_OF_DATE=live` to use the real date, or `VITE_AS_OF_DATE=YYYY-MM-DD` for another snapshot.

## Pilot setup (Vercel + Neon Postgres)

The app is deployed on Vercel from GitHub (`main`), with a Neon Postgres database attached through the Vercel integration (which injects `DATABASE_URL`).

### Sign-in, users and roles

- Users sign in with a username and password (scrypt-hashed; sessions are HttpOnly cookies, 7 days). New users and password resets get a one-time password that must be changed at first sign-in. Five wrong passwords lock the account for 15 minutes.
- **Users & Roles** (Administration menu) creates users, assigns roles, disables accounts and resets passwords.
- Each role grants **read / write / delete** per menu (`src/lib/permissions.ts`). Read shows the menu; write creates and edits; delete removes records and cancels invoices and payments. The server checks write and delete on every change. Built-in roles: Administrator (full, locked), Project Manager, Accounts, Site Engineer, Viewer.

### How a change is saved

Every change is a named **command** (`src/store/commands.ts`), for example `addExpense` or `cancelClientInvoice`. The browser sends `POST /api/command`, and the server then:

1. checks the user's role for the command's menu and level;
2. loads the latest data and runs the same pure action (`src/store/actions.ts`), so the server assigns all **record numbers** from never-decreasing counters (deleted or cancelled numbers are not reused);
3. validates the input and rejects any result that adds an integrity error from `src/lib/audit.ts` (overpayment, unknown references, amount ≠ qty × rate …);
4. saves the changed rows in one transaction, only if no one else saved in between (otherwise it re-runs on the new data), and writes an **activity log** entry with before/after values.

Open browsers check for other users' changes every 20 seconds and whenever the window regains focus. A double-click sends only one request.

### Other pilot features

- **Safe delete & cancel:** expenses, documents, draft quotations, planned phases and unused clients/suppliers can be deleted. Invoices and payments are never deleted; *Cancel* (with a reason) removes them from all totals and keeps them in `cancelled_records`.
- **Documents:** real files (PDF, images, Excel, Word, CSV; ≤ 4 MB) are stored in Postgres and opened from the Documents page.
- **Print:** quotation, invoice and payment receipt layouts with the company letterhead from *Settings & Backup* (no GST in the pilot).
- **Backup:** *Settings & Backup → Download backup* exports everything as JSON. Neon also keeps point-in-time history.
- **Go-live:** *Settings & Backup → Clear all business data* empties business tables and keeps users, roles and settings.
- **Dates:** "today" is the real date in India (Asia/Kolkata). Tests and `docs/figures.json` stay on the demo date (`VITE_AS_OF_DATE`).

### Local development

Copy `.env.example` to `.env.local` and set `DATABASE_URL`. `npm run dev` serves `/api/*` itself.

```bash
npm run db:migrate          # create tables, default roles, first admin (prints a one-time password)
npm run db:seed             # replace business data with the demo seed (users kept)
npm run db:clear            # delete all business data (users, roles, settings kept)
npm run db:status           # row counts and users
npm run db:admin -- admin   # reset a user's password (prints a one-time password)
```

When no API is reachable, the app falls back to a browser-only demo with full access and `localStorage` data. If the API answers with an error, the app shows the error instead of falling back.

## Architecture

| Layer | File | Becomes, when the backend arrives |
|---|---|---|
| Entity types | `src/data/types.ts` | DB tables (`clients`, `projects`, `quotations`, `quotation_items`, `contracts`, `project_phases` + `phase_budgets`, `expenses`, `suppliers`, `supplier_invoices`, `supplier_payments`, `client_invoices`, `client_payments`, `change_orders`, `documents`, `project_closure`) |
| Seed data | `src/data/seed.ts` | API responses / DB seed |
| Calculations | `src/lib/calc.ts` | Server-side reporting endpoints (same return shapes) |
| Mutations | `src/store/actions.ts` | Pure actions, run on the server through `src/store/commands.ts` |
| Store | `src/store/store.tsx` | Signs in, loads data, runs commands via `/api/command`; screens only call `useStore()` |
| API | `api/*.ts` | Vercel functions: `auth`, `db`, `command`, `files`, `admin` |

Screens never compute money inline. Every figure comes from `calc.ts`.

## Business rules

- **Only primary facts are stored.** Totals, pending amounts and statuses are always derived. A supplier invoice amount is the sum of its expense lines. Pending = invoice − payments.
- **Expense ≠ payment.** An expense is a cost booked to Project → Phase. A supplier invoice is a payable, and supplier payments reduce it.
- **Settlement discount.** A supplier payment can carry a discount, e.g. 2% for early payment. The invoice is settled when payments + discounts cover it. The discount lowers that purchase's project cost: it is spread across the invoice lines in proportion to their amounts, to the rupee. Cash flow counts only the money actually paid. A settled or discounted invoice can't take new lines.
- **Transport for a purchase.** Freight is linked to the purchase it delivers and booked in the same phase and cost category, giving a landed cost (material + transport). It can be paid in cash at site, added to the supplier's open invoice, or billed on a separate transporter's invoice. Deleting a purchase also deletes its transport charges.
- **Own labour** = daily rate × days. **Outsource** = fixed amount, or quantity × rate (sq.ft, sq.m, running ft, …).
- **Change orders.** Approving one adds its revenue to the project and creates a phase to track its cost.
- **Profit recognition.** Profit is recognised only when a phase is completed: actual profit = contract value of completed phases − their actual cost. Cost already spent on unfinished phases is shown as work in progress (WIP), not as a loss. Three other figures are shown alongside:
  - billed profit = billed − all actual cost
  - expected profit = revenue − planned cost
  - forecast profit = final revenue − expected final cost, where unfinished phases count at the higher of their budget or the cost so far
- **Cash position** = client receipts − supplier payments − own labour/direct site payments. It is kept separate from profit.
- **Phase status follows billing.** A completed phase that is fully billed becomes *Billed*. Once fully received it becomes *Payment Received*. When all phases are done, an Active project becomes *Completed*.
