# Maali Civil ERP — Frontend MVP

A frontend prototype for managing civil engineering projects. It covers the full flow from quotation to contract, phases, costs, billing, payments, profit and closure. Everything runs in the browser on demo data, with no backend yet.

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

Demo data is saved in `localStorage`. Use **Reset demo data** in the top bar to restore the original seed.

## Architecture

| Layer | File | Becomes, when the backend arrives |
|---|---|---|
| Entity types | `src/data/types.ts` | DB tables (`clients`, `projects`, `quotations`, `quotation_items`, `contracts`, `project_phases` + `phase_budgets`, `expenses`, `suppliers`, `supplier_invoices`, `supplier_payments`, `client_invoices`, `client_payments`, `change_orders`, `documents`, `project_closure`) |
| Seed data | `src/data/seed.ts` | API responses / DB seed |
| Calculations | `src/lib/calc.ts` | Server-side reporting endpoints (same return shapes) |
| Mutations | `src/store/actions.ts` | One REST endpoint each (`POST /expenses`, `PATCH /phases/:id`, …) |
| Store | `src/store/store.tsx` | API client / React Query; screens only call `useStore()` |

Screens never compute money inline. Every figure comes from `calc.ts`.

## Business rules

- **Only primary facts are stored.** Totals, pending amounts and statuses are always derived. A supplier invoice amount is the sum of its expense lines. Pending = invoice − payments.
- **Expense ≠ payment.** An expense is a cost booked to Project → Phase. A supplier invoice is a payable, and supplier payments reduce it.
- **Own labour** = daily rate × days. **Outsource** = fixed amount, or quantity × rate (sq.ft, sq.m, running ft, …).
- **Change orders.** Approving one adds its revenue to the project and creates a phase to track its cost.
- **Profit recognition.** Profit is recognised only when a phase is completed: actual profit = contract value of completed phases − their actual cost. Cost already spent on unfinished phases is shown as work in progress (WIP), not as a loss. Three other figures are shown alongside:
  - billed profit = billed − all actual cost
  - expected profit = revenue − planned cost
  - forecast profit = final revenue − expected final cost, where unfinished phases count at the higher of their budget or the cost so far
- **Cash position** = client receipts − supplier payments − own labour/direct site payments. It is kept separate from profit.
- **Phase status follows billing.** A completed phase that is fully billed becomes *Billed*. Once fully received it becomes *Payment Received*. When all phases are done, an Active project becomes *Completed*.
