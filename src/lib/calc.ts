import type {
  ClientInvoice, CostCategory, Database, Phase, PhaseStatus, Project, SupplierInvoice,
} from '../data/types'
import { today } from './format'

// ---------------------------------------------------------------------------
// Business calculation layer. Screens never compute money inline — they call
// these functions. A future backend can return the same shapes from its own
// endpoints (e.g. GET /projects/:id/financials) and the UI stays unchanged.
//
// Profit recognition (MVP): profit is recognised only when a phase is
// completed. Actual profit = contract value of completed phases − their actual
// cost. Cost already spent on unfinished phases is reported as work in progress
// (WIP), not as a loss. Billed profit (billed − actual cost) and forecast
// profit (final revenue − expected final cost) are reported alongside.
// ---------------------------------------------------------------------------

export const COST_CATEGORIES: CostCategory[] = ['material', 'labour', 'outsource', 'other']
export const COST_LABEL: Record<CostCategory, string> = {
  material: 'Material', labour: 'Own Labour', outsource: 'Outsource', other: 'Other Direct',
}

export type CostBreakdown = Record<CostCategory, number> & { total: number }

const emptyBreakdown = (): CostBreakdown => ({ material: 0, labour: 0, outsource: 0, other: 0, total: 0 })
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function addBreakdowns(list: CostBreakdown[]): CostBreakdown {
  const out = emptyBreakdown()
  for (const b of list) for (const k of [...COST_CATEGORIES, 'total'] as const) out[k] += b[k]
  return out
}

export const profitMargin = (profit: number, revenue: number) => (revenue > 0 ? (profit / revenue) * 100 : 0)

// ---- Phase ------------------------------------------------------------------

const DONE_STATUSES: PhaseStatus[] = ['Completed', 'Billed', 'Payment Received', 'Closed']
export const isPhaseDone = (p: Phase) => DONE_STATUSES.includes(p.status)

export function phaseCompletion(p: Phase): number {
  return isPhaseDone(p) ? 100 : Math.min(Math.max(p.progress, 0), 100)
}

export function plannedCost(p: Phase): CostBreakdown {
  const b = p.budget
  return { ...b, total: b.material + b.labour + b.outsource + b.other }
}

export function actualCost(db: Database, phaseId: string): CostBreakdown {
  const out = emptyBreakdown()
  for (const e of db.expenses) if (e.phaseId === phaseId) { out[e.category] += e.amount; out.total += e.amount }
  return out
}

export function phaseBilling(db: Database, phaseId: string) {
  const invoices = db.clientInvoices.filter((i) => i.phaseId === phaseId)
  const billed = sum(invoices.map((i) => i.amount))
  const received = sum(invoices.map((i) => clientInvoicePaid(db, i.id)))
  return { invoices, billed, received, pending: billed - received }
}

export function phaseFinancials(db: Database, p: Phase) {
  const planned = plannedCost(p)
  const actual = actualCost(db, p.id)
  const completion = phaseCompletion(p)
  const revenue = p.contractValue
  const done = isPhaseDone(p)
  const completedRevenue = done ? revenue : 0
  const completedCost = done ? actual.total : 0
  const expectedProfit = revenue - planned.total
  const actualProfit = completedRevenue - completedCost
  const estimateAtCompletion = done ? actual.total : Math.max(actual.total, planned.total)
  const billing = phaseBilling(db, p.id)
  return {
    revenue,
    done,
    completedRevenue,
    completedCost,
    wipCost: done ? 0 : actual.total,
    planned,
    actual,
    completion,
    expectedProfit,
    expectedMargin: profitMargin(expectedProfit, revenue),
    actualProfit,
    actualMargin: profitMargin(actualProfit, completedRevenue),
    billedProfit: billing.billed - actual.total,
    budgetVariance: actual.total - planned.total, // negative = under budget
    budgetUsedPct: planned.total > 0 ? (actual.total / planned.total) * 100 : 0,
    estimateAtCompletion,
    forecastProfit: revenue - estimateAtCompletion,
    billed: billing.billed,
    received: billing.received,
    clientPending: billing.pending,
    unbilled: revenue - billing.billed,
  }
}
export type PhaseFinancials = ReturnType<typeof phaseFinancials>

// ---- Client invoices ---------------------------------------------------------

export type ClientInvoiceStatus = 'Unbilled' | 'Billed' | 'Partially Paid' | 'Paid' | 'Overdue'

export const clientInvoicePaid = (db: Database, invoiceId: string) =>
  sum(db.clientPayments.filter((p) => p.clientInvoiceId === invoiceId).map((p) => p.amount))

export const clientInvoicePending = (db: Database, inv: ClientInvoice) => inv.amount - clientInvoicePaid(db, inv.id)

export function clientInvoiceStatus(db: Database, inv: ClientInvoice): ClientInvoiceStatus {
  const paid = clientInvoicePaid(db, inv.id)
  if (paid >= inv.amount) return 'Paid'
  if (inv.dueDate < today()) return 'Overdue'
  return paid > 0 ? 'Partially Paid' : 'Billed'
}

// ---- Supplier invoices -------------------------------------------------------

export type SupplierInvoiceStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue'

export const supplierInvoiceAmount = (db: Database, invoiceId: string) =>
  sum(db.expenses.filter((e) => e.supplierInvoiceId === invoiceId).map((e) => e.amount))

export const supplierInvoicePaid = (db: Database, invoiceId: string) =>
  sum(db.supplierPayments.filter((p) => p.supplierInvoiceId === invoiceId).map((p) => p.amount))

export function supplierInvoiceView(db: Database, inv: SupplierInvoice) {
  const amount = supplierInvoiceAmount(db, inv.id)
  const paid = supplierInvoicePaid(db, inv.id)
  const pending = amount - paid
  let status: SupplierInvoiceStatus = paid >= amount ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid'
  if (pending > 0 && inv.dueDate < today()) status = 'Overdue'
  const phaseIds = [...new Set(db.expenses.filter((e) => e.supplierInvoiceId === inv.id).map((e) => e.phaseId))]
  return { ...inv, amount, paid, pending, status, overdue: status === 'Overdue' ? pending : 0, phaseIds }
}
export type SupplierInvoiceView = ReturnType<typeof supplierInvoiceView>

function supplierTotals(views: SupplierInvoiceView[]) {
  return {
    invoiced: sum(views.map((v) => v.amount)),
    paid: sum(views.map((v) => v.paid)),
    pending: sum(views.map((v) => v.pending)),
    overdue: sum(views.map((v) => v.overdue)),
  }
}

export function supplierFinancials(db: Database, supplierId: string) {
  const invoices = db.supplierInvoices.filter((i) => i.supplierId === supplierId).map((i) => supplierInvoiceView(db, i))
  return { invoices, ...supplierTotals(invoices) }
}

// ---- Project -----------------------------------------------------------------

export const projectPhases = (db: Database, projectId: string) =>
  db.phases.filter((p) => p.projectId === projectId).sort((a, b) => a.sequence - b.sequence)

export const approvedChangeOrderRevenue = (db: Database, projectId: string) =>
  sum(db.changeOrders.filter((c) => c.projectId === projectId && c.status === 'Approved').map((c) => c.revenue))

/** Weighted by phase contract value. */
export function projectCompletion(db: Database, projectId: string): number {
  const phases = projectPhases(db, projectId)
  const total = sum(phases.map((p) => p.contractValue))
  if (!total) return 0
  return sum(phases.map((p) => p.contractValue * phaseCompletion(p))) / total
}

export function projectFinancials(db: Database, projectId: string) {
  const project = db.projects.find((p) => p.id === projectId)!
  const phases = projectPhases(db, projectId)
  const pf = phases.map((p) => phaseFinancials(db, p))

  const originalContract = project.contractValue
  const changeOrderRevenue = approvedChangeOrderRevenue(db, projectId)
  const revenue = originalContract + changeOrderRevenue
  const planned = addBreakdowns(pf.map((f) => f.planned))
  const actual = addBreakdowns(pf.map((f) => f.actual))
  const completedRevenue = sum(pf.map((f) => f.completedRevenue))
  const completedCost = sum(pf.map((f) => f.completedCost))
  const wipCost = sum(pf.map((f) => f.wipCost))
  const expectedProfit = revenue - planned.total
  // budgeted profit of the phases that are now complete, for variance
  const completedExpected = sum(pf.filter((f) => f.done).map((f) => f.expectedProfit))
  const actualProfit = completedRevenue - completedCost
  const estimateAtCompletion = sum(pf.map((f) => f.estimateAtCompletion))

  const invoices = db.clientInvoices.filter((i) => i.projectId === projectId)
  const billed = sum(invoices.map((i) => i.amount))
  const received = sum(invoices.map((i) => clientInvoicePaid(db, i.id)))
  const clientOverdue = sum(invoices.filter((i) => clientInvoiceStatus(db, i) === 'Overdue').map((i) => clientInvoicePending(db, i)))

  const sup = supplierTotals(db.supplierInvoices.filter((i) => i.projectId === projectId).map((i) => supplierInvoiceView(db, i)))
  // Own labour & other direct costs are paid directly at site (no supplier invoice).
  const directPaid = sum(db.expenses.filter((e) => e.projectId === projectId && !e.supplierInvoiceId).map((e) => e.amount))

  return {
    project,
    phases,
    originalContract,
    changeOrderRevenue,
    revenue,
    completedRevenue,
    completedCost,
    completedActual: addBreakdowns(pf.filter((f) => f.done).map((f) => f.actual)),
    wipCost,
    planned,
    actual,
    expectedProfit,
    expectedMargin: profitMargin(expectedProfit, revenue),
    actualProfit,
    actualMargin: profitMargin(actualProfit, completedRevenue),
    profitVariance: actualProfit - completedExpected,
    budgetVariance: actual.total - planned.total,
    estimateAtCompletion,
    forecastProfit: revenue - estimateAtCompletion,
    forecastMargin: profitMargin(revenue - estimateAtCompletion, revenue),
    completion: projectCompletion(db, projectId),
    billed,
    received,
    clientPending: billed - received,
    billedProfit: billed - actual.total,
    clientOverdue,
    unbilled: revenue - billed,
    supplierInvoiced: sup.invoiced,
    supplierPaid: sup.paid,
    supplierPending: sup.pending,
    supplierOverdue: sup.overdue,
    directPaid,
    cashPosition: received - sup.paid - directPaid,
  }
}
export type ProjectFinancials = ReturnType<typeof projectFinancials>

export function canCloseProject(db: Database, projectId: string) {
  const phases = projectPhases(db, projectId)
  const f = projectFinancials(db, projectId)
  const checks = [
    { label: 'All phases completed', ok: phases.length > 0 && phases.every(isPhaseDone) },
    { label: 'All client invoices generated', ok: f.unbilled <= 0 },
    { label: 'Client payments received / outstanding recorded', ok: true, note: f.clientPending > 0 ? `Outstanding recorded` : 'Fully received' },
    { label: 'All expenses recorded', ok: phases.every((p) => actualCost(db, p.id).total > 0) },
    { label: 'Supplier invoices recorded', ok: db.expenses.filter((e) => e.projectId === projectId && (e.category === 'material' || e.category === 'outsource')).every((e) => !!e.supplierInvoiceId) },
    { label: 'Supplier payments recorded', ok: true, note: f.supplierPending > 0 ? 'Outstanding recorded' : 'Fully settled' },
    { label: 'Final profit calculated', ok: true },
    { label: 'Pending client amount displayed', ok: true },
    { label: 'Pending supplier amount displayed', ok: true },
  ]
  return { checks, ready: checks.every((c) => c.ok), financials: f }
}

// ---- Client ------------------------------------------------------------------

export function clientFinancials(db: Database, clientId: string) {
  const projects = db.projects.filter((p) => p.clientId === clientId)
  const fins = projects.map((p) => projectFinancials(db, p.id))
  return {
    projects,
    contractValue: sum(fins.map((f) => f.revenue)),
    billed: sum(fins.map((f) => f.billed)),
    received: sum(fins.map((f) => f.received)),
    pending: sum(fins.map((f) => f.clientPending)),
    overdue: sum(fins.map((f) => f.clientOverdue)),
    activePhases: sum(fins.map((f) => f.phases.filter((ph) => ph.status === 'In Progress').length)),
    completedProjects: projects.filter((p) => p.status === 'Completed' || p.status === 'Closed').length,
  }
}

// ---- Quotation ---------------------------------------------------------------

export function quotationTotals(db: Database, quotationId: string) {
  const items = db.quotationItems.filter((i) => i.quotationId === quotationId)
  const value = sum(items.map((i) => i.amount))
  const estimatedCost = sum(items.map((i) => i.estimatedCost))
  return { items, value, estimatedCost, expectedProfit: value - estimatedCost, margin: profitMargin(value - estimatedCost, value) }
}

// ---- Portfolio ---------------------------------------------------------------

const PORTFOLIO_STATUSES: Project['status'][] = ['Active', 'On Hold', 'Completed', 'Closed', 'Contract Pending']

export function portfolioSummary(db: Database) {
  const projects = db.projects.filter((p) => PORTFOLIO_STATUSES.includes(p.status))
  const fins = projects.map((p) => projectFinancials(db, p.id))
  const completedRevenue = sum(fins.map((f) => f.completedRevenue))
  const actualProfit = sum(fins.map((f) => f.actualProfit))
  return {
    fins,
    activeProjects: projects.filter((p) => p.status === 'Active').length,
    totalProjects: projects.length,
    contractValue: sum(fins.map((f) => f.revenue)),
    received: sum(fins.map((f) => f.received)),
    billed: sum(fins.map((f) => f.billed)),
    clientReceivable: sum(fins.map((f) => f.clientPending)),
    clientOverdue: sum(fins.map((f) => f.clientOverdue)),
    plannedCost: sum(fins.map((f) => f.planned.total)),
    actualCost: sum(fins.map((f) => f.actual.total)),
    actualByCategory: addBreakdowns(fins.map((f) => f.actual)),
    supplierInvoiced: sum(fins.map((f) => f.supplierInvoiced)),
    supplierPaid: sum(fins.map((f) => f.supplierPaid)),
    supplierPayable: sum(fins.map((f) => f.supplierPending)),
    supplierOverdue: sum(fins.map((f) => f.supplierOverdue)),
    completedRevenue,
    wipCost: sum(fins.map((f) => f.wipCost)),
    actualProfit,
    averageMargin: profitMargin(actualProfit, completedRevenue),
    billedProfit: sum(fins.map((f) => f.billedProfit)),
    forecastProfit: sum(fins.map((f) => f.forecastProfit)),
    forecastMargin: profitMargin(sum(fins.map((f) => f.forecastProfit)), sum(fins.map((f) => f.revenue))),
    statusCounts: db.projects.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {}),
  }
}
