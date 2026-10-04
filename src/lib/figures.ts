import type { Database } from '../data/types'
import {
  COST_CATEGORIES, clientInvoicePaid, clientInvoiceStatus, phaseFinancials, portfolioSummary, projectFinancials,
  quotationTotals, supplierInvoiceView,
} from './calc'
import { today } from './format'

// ---------------------------------------------------------------------------
// Every figure quoted in documentation (the walkthrough deck, README) comes
// from here, so docs can never drift from what the app calculates.
//   npm run figures   → writes docs/figures.json
// The test suite snapshots the same object.
// ---------------------------------------------------------------------------

const r2 = (n: number) => Math.round(n * 100) / 100

export function buildFigures(db: Database) {
  const s = portfolioSummary(db)

  const projects = Object.fromEntries(db.projects.map((p) => {
    const f = projectFinancials(db, p.id)
    return [p.id, {
      name: p.name, shortName: p.shortName, status: p.status,
      originalContract: f.originalContract, changeOrderRevenue: f.changeOrderRevenue, revenue: f.revenue,
      plannedCost: f.planned.total, actualCost: f.actual.total, actualByCategory: pick(f.actual),
      completedRevenue: f.completedRevenue, completedCost: f.completedCost, wipCost: f.wipCost,
      completedPhases: f.phases.filter((ph) => phaseFinancials(db, ph).done).length, phases: f.phases.length,
      actualProfit: f.actualProfit, actualMargin: r2(f.actualMargin),
      expectedProfit: f.expectedProfit, expectedMargin: r2(f.expectedMargin),
      forecastProfit: f.forecastProfit, forecastMargin: r2(f.forecastMargin),
      billedProfit: f.billedProfit, budgetVariance: f.budgetVariance, profitVariance: f.profitVariance,
      completion: r2(f.completion),
      billed: f.billed, received: f.received, clientPending: f.clientPending, clientOverdue: f.clientOverdue, unbilled: f.unbilled,
      supplierInvoiced: f.supplierInvoiced, supplierPaid: f.supplierPaid, supplierPending: f.supplierPending, supplierOverdue: f.supplierOverdue,
      directPaid: f.directPaid, cashPosition: f.cashPosition,
    }]
  }))

  const phases = Object.fromEntries(db.phases.map((ph) => {
    const f = phaseFinancials(db, ph)
    return [ph.id, {
      name: ph.name, projectId: ph.projectId, status: ph.status, done: f.done, completion: f.completion,
      revenue: f.revenue, planned: pick(f.planned), actual: pick(f.actual),
      actualProfit: f.actualProfit, actualMargin: r2(f.actualMargin), expectedProfit: f.expectedProfit, expectedMargin: r2(f.expectedMargin),
      forecastProfit: f.forecastProfit, wipCost: f.wipCost, budgetVariance: f.budgetVariance, budgetUsedPct: r2(f.budgetUsedPct),
      categoryUsedPct: Object.fromEntries(COST_CATEGORIES.map((k) => [k, f.planned[k] ? r2((f.actual[k] / f.planned[k]) * 100) : 0])),
      billed: f.billed, received: f.received, clientPending: f.clientPending, unbilled: f.unbilled, billedProfit: f.billedProfit,
    }]
  }))

  const expenses = Object.fromEntries(db.expenses.map((e) => [e.id, {
    phaseId: e.phaseId, category: e.category, subType: e.subType, description: e.description, amount: e.amount,
    quantity: e.quantity, unit: e.unit, rate: e.rate, dailyRate: e.dailyRate, days: e.days, workerName: e.workerName, basis: e.basis,
  }]))

  const supplierInvoices = Object.fromEntries(db.supplierInvoices.map((i) => {
    const v = supplierInvoiceView(db, i)
    return [i.id, {
      supplier: db.suppliers.find((x) => x.id === i.supplierId)?.name, invoiceNumber: i.invoiceNumber, projectId: i.projectId,
      invoiceDate: i.invoiceDate, dueDate: i.dueDate, amount: v.amount, paid: v.paid, pending: v.pending, status: v.status,
      lines: db.expenses.filter((e) => e.supplierInvoiceId === i.id).map((e) => e.id),
    }]
  }))

  const clientInvoices = Object.fromEntries(db.clientInvoices.map((i) => [i.id, {
    invoiceNumber: i.invoiceNumber, projectId: i.projectId, phaseId: i.phaseId, description: i.description,
    invoiceDate: i.invoiceDate, dueDate: i.dueDate, amount: i.amount, received: clientInvoicePaid(db, i.id),
    pending: i.amount - clientInvoicePaid(db, i.id), status: clientInvoiceStatus(db, i),
    payments: db.clientPayments.filter((p) => p.clientInvoiceId === i.id).map((p) => ({ id: p.id, date: p.date, amount: p.amount, method: p.method })),
  }]))

  const quotations = Object.fromEntries(db.quotations.map((q) => {
    const t = quotationTotals(db, q.id)
    return [q.id, { projectName: q.projectName, status: q.status, projectId: q.projectId ?? null, value: t.value, estimatedCost: t.estimatedCost, expectedProfit: t.expectedProfit, margin: r2(t.margin) }]
  }))

  const changeOrders = Object.fromEntries(db.changeOrders.map((c) => [c.id, {
    number: c.number, projectId: c.projectId, description: c.description, status: c.status, revenue: c.revenue,
    estimatedCost: c.estimatedCost, expectedProfit: c.revenue - c.estimatedCost, phaseId: c.phaseId ?? null,
  }]))

  return {
    asOf: today(),
    portfolio: {
      projects: s.totalProjects, activeProjects: s.activeProjects,
      contractValue: s.contractValue, billed: s.billed, received: s.received,
      clientReceivable: s.clientReceivable, clientOverdue: s.clientOverdue,
      supplierInvoiced: s.supplierInvoiced, supplierPaid: s.supplierPaid, supplierPayable: s.supplierPayable, supplierOverdue: s.supplierOverdue,
      plannedCost: s.plannedCost, actualCost: s.actualCost, actualByCategory: pick(s.actualByCategory), wipCost: s.wipCost,
      completedRevenue: s.completedRevenue, actualProfit: s.actualProfit, actualMargin: r2(s.averageMargin),
      billedProfit: s.billedProfit, forecastProfit: s.forecastProfit, forecastMargin: r2(s.forecastMargin),
      forecastCost: s.contractValue - s.forecastProfit,
      clientInvoiceCount: db.clientInvoices.length,
      overdueClientInvoices: db.clientInvoices.filter((i) => clientInvoiceStatus(db, i) === 'Overdue').length,
    },
    counts: Object.fromEntries(Object.entries(db).map(([k, v]) => [k, (v as unknown[]).length])),
    projects, phases, expenses, supplierInvoices, clientInvoices, quotations, changeOrders,
  }
}
export type Figures = ReturnType<typeof buildFigures>

function pick(b: Record<string, number>) {
  return { material: b.material, labour: b.labour, outsource: b.outsource, other: b.other, total: b.total }
}
