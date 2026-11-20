import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import type { Database } from '../data/types'
import * as A from '../store/actions'
import { auditDatabase } from './audit'
import {
  canCloseProject, clientInvoicePaid, expenseNetAmount, phaseFinancials, portfolioSummary, projectFinancials, purchaseLanding, quotationTotals, supplierInvoiceView,
} from './calc'
import { buildFigures } from './figures'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const errors = (db: Database) => auditDatabase(db).filter((i) => i.level === 'error')
const phase = (db: Database, id: string) => phaseFinancials(db, db.phases.find((p) => p.id === id)!)

describe('demo seed integrity', () => {
  it('passes the audit with no errors or warnings', () => {
    expect(auditDatabase(createSeed())).toEqual([])
  })

  it('meets the minimum demo data volumes', () => {
    const db = createSeed()
    const count = (c: string) => db.expenses.filter((e) => e.category === c).length
    expect(db.clients.length).toBeGreaterThanOrEqual(3)
    expect(db.projects.length).toBeGreaterThanOrEqual(3)
    expect(db.quotations.length).toBeGreaterThanOrEqual(5)
    expect(db.phases.length).toBeGreaterThanOrEqual(12)
    expect(db.suppliers.length).toBeGreaterThanOrEqual(5)
    expect(count('material')).toBeGreaterThanOrEqual(15)
    expect(count('labour')).toBeGreaterThanOrEqual(10)
    expect(count('outsource')).toBeGreaterThanOrEqual(8)
    expect(db.supplierInvoices.length).toBeGreaterThanOrEqual(10)
    expect(db.supplierPayments.length).toBeGreaterThanOrEqual(15)
    expect(db.clientInvoices.length).toBeGreaterThanOrEqual(10)
    expect(db.clientPayments.length).toBeGreaterThanOrEqual(15)
    expect(db.changeOrders.length).toBeGreaterThanOrEqual(3)
  })

  it('docs/figures.json matches what the app calculates (run `npm run figures` after changing the seed)', () => {
    const onDisk = JSON.parse(readFileSync('docs/figures.json', 'utf8'))
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(buildFigures(createSeed()))))
  })
})

describe('spec worked examples', () => {
  const db = createSeed()

  it('Foundation phase: ₹8,00,000 revenue − ₹5,10,000 cost = ₹2,90,000 at 36.25%', () => {
    const f = phase(db, 'PH-001')
    expect(f.revenue).toBe(800000)
    expect(f.planned).toMatchObject({ material: 220000, labour: 130000, outsource: 200000, total: 550000 })
    expect(f.actual).toMatchObject({ material: 210000, labour: 120000, outsource: 180000, total: 510000 })
    expect(f.budgetVariance).toBe(-40000)
    expect(f.actualProfit).toBe(290000)
    expect(f.actualMargin).toBeCloseTo(36.25, 10)
    expect([f.billed, f.received, f.clientPending]).toEqual([800000, 600000, 200000])
  })

  it('cost calculations: qty × rate, daily rate × days, fixed', () => {
    const e = (id: string) => db.expenses.find((x) => x.id === id)!
    expect(e('EXP-001')).toMatchObject({ quantity: 250, rate: 420, amount: 105000 })
    expect(e('EXP-003')).toMatchObject({ dailyRate: 1200, days: 25, amount: 30000 })
    expect(e('EXP-005')).toMatchObject({ dailyRate: 800, days: 25, amount: 20000 })
    expect(e('EXP-008')).toMatchObject({ basis: 'fixed', amount: 150000 })
  })

  it('QT-2026-001: ₹50 L quote, ₹34 L estimated cost, ₹16 L expected profit', () => {
    expect(quotationTotals(db, 'QT-2026-001')).toMatchObject({ value: 5000000, estimatedCost: 3400000, expectedProfit: 1600000 })
  })

  it('CO-2026-001 lifts ABC Villa from ₹50 L to ₹55 L', () => {
    const f = projectFinancials(db, 'PRJ-2026-001')
    expect([f.originalContract, f.changeOrderRevenue, f.revenue]).toEqual([5000000, 500000, 5500000])
  })
})

describe('money identities hold for every project and the portfolio', () => {
  const db = createSeed()
  const s = portfolioSummary(db)

  it.each(db.projects.map((p) => p.id))('%s', (id) => {
    const f = projectFinancials(db, id)
    expect(f.actual.total).toBe(f.actual.material + f.actual.labour + f.actual.outsource + f.actual.other)
    expect(f.actual.total).toBe(f.completedCost + f.wipCost)
    expect(f.actualProfit).toBe(f.completedRevenue - f.completedCost)
    expect(f.billedProfit).toBe(f.billed - f.actual.total)
    expect(f.clientPending).toBe(f.billed - f.received)
    expect(f.unbilled).toBe(f.revenue - f.billed)
    expect(f.cashPosition).toBe(f.received - f.supplierPaid - f.directPaid)
    // every rupee of cost is a supplier invoice (net of settlement discounts) or a direct site payment
    expect(f.actual.total).toBe(f.supplierInvoiced - f.supplierDiscount + f.directPaid)
    expect(f.supplierPending).toBe(f.supplierInvoiced - f.supplierPaid - f.supplierDiscount)
    expect(f.forecastProfit).toBe(f.revenue - f.estimateAtCompletion)
  })

  it('portfolio totals equal the sum of projects', () => {
    const fins = db.projects.map((p) => projectFinancials(db, p.id))
    expect(s.contractValue).toBe(sum(fins.map((f) => f.revenue)))
    expect(s.billed).toBe(sum(db.clientInvoices.map((i) => i.amount)))
    expect(s.received).toBe(sum(db.clientPayments.map((p) => p.amount)))
    expect(s.supplierPaid).toBe(sum(db.supplierPayments.map((p) => p.amount)))
    expect(s.clientReceivable).toBe(s.billed - s.received)
    expect(s.supplierPayable).toBe(s.supplierInvoiced - s.supplierPaid - s.supplierDiscount)
    expect(s.actualCost).toBe(sum(db.expenses.map((e) => e.amount)) - s.supplierDiscount)
    expect(s.actualProfit).toBe(sum(fins.map((f) => f.actualProfit)))
    expect(s.wipCost).toBe(sum(fins.map((f) => f.wipCost)))
  })
})

describe('supplier settlement discounts', () => {
  const view = (db: Database, id: string) => supplierInvoiceView(db, db.supplierInvoices.find((i) => i.id === id)!)

  it('demo: SRK cement SIN-028 settled at 2% discount', () => {
    const v = view(createSeed(), 'SIN-028')
    expect(v).toMatchObject({ amount: 202500, paid: 198450, discount: 4050, pending: 0, status: 'Paid', netCost: 198450 })
  })

  it('paying with a discount settles the invoice and lowers the purchase cost, not just the payable', () => {
    const db0 = createSeed()
    const before = { inv: view(db0, 'SIN-007'), phase: phase(db0, 'PH-002'), project: projectFinancials(db0, 'PRJ-2026-001') }
    expect(before.inv).toMatchObject({ amount: 108000, pending: 108000 })
    const db = A.addSupplierPayment(db0, { supplierInvoiceId: 'SIN-007', date: '2026-10-04', amount: 105000, discount: 3000, method: 'Bank Transfer', reference: 'D1' })
    expect(errors(db)).toEqual([])
    expect(view(db, 'SIN-007')).toMatchObject({ paid: 105000, discount: 3000, pending: 0, status: 'Paid' })
    expect(phase(db, 'PH-002').actual.material).toBe(before.phase.actual.material - 3000)
    const after = projectFinancials(db, 'PRJ-2026-001')
    expect(after.actual.total).toBe(before.project.actual.total - 3000)
    expect(after.supplierPending).toBe(before.project.supplierPending - 108000)
    expect(after.cashPosition).toBe(before.project.cashPosition - 105000) // only cash moves cash
    expect(after.forecastProfit).toBeGreaterThanOrEqual(before.project.forecastProfit)
  })

  it('splits a discount across invoice lines pro rata, to the rupee', () => {
    // SIN-031: ₹1,20,000 electrical material + ₹45,000 installation (outsource), ₹1,00,000 already paid
    const db = A.addSupplierPayment(createSeed(), { supplierInvoiceId: 'SIN-031', date: '2026-10-04', amount: 61700, discount: 3300, method: 'Bank Transfer', reference: 'D2' })
    expect(errors(db)).toEqual([])
    const lines = db.expenses.filter((e) => e.supplierInvoiceId === 'SIN-031')
    expect(lines.map((e) => e.amount - expenseNetAmount(db, e))).toEqual([2400, 900])
    expect(phase(db, 'PH-014').actual).toMatchObject({ material: 120000 - 2400, outsource: 45000 - 900 })
  })

  it('the audit rejects payment + discount above the invoice', () => {
    const db = A.addSupplierPayment(createSeed(), { supplierInvoiceId: 'SIN-007', date: '2026-10-04', amount: 108000, discount: 1, method: 'Cash', reference: 'X' })
    expect(errors(db).some((i) => i.table === 'supplierInvoices')).toBe(true)
  })
})

describe('transport for a specific purchase', () => {
  it('demo: freight on three purchases, one per payment route', () => {
    const db = createSeed()
    const t = db.expenses.filter((e) => e.linkedExpenseId)
    expect(t.map((e) => [e.linkedExpenseId, e.amount, e.supplierInvoiceId ?? 'cash'])).toEqual([
      ['EXP-010', 6000, 'cash'], ['EXP-042', 8000, 'SIN-020'], ['EXP-053', 18000, 'SIN-035'],
    ])
    expect(purchaseLanding(db, db.expenses.find((e) => e.id === 'EXP-010')!).landedCost).toBe(252000 + 6000)
  })

  it.each([
    ['paid at site', { via: 'cash' } as A.TransportPayment],
    ['on the supplier invoice', { via: 'sameInvoice' } as A.TransportPayment],
    ['on a transporter invoice', { via: 'transporter', supplierId: 'SUP-008', invoiceNumber: 'SMT/26/099', invoiceDate: '2026-10-04', dueDate: '2026-11-03' } as A.TransportPayment],
  ])('adds landed cost to the purchase phase when %s', (_, payment) => {
    const db0 = createSeed()
    const purchase = db0.expenses.find((e) => e.id === 'EXP-041')! // GV cement, SIN-019
    const [db, t] = A.addTransportCharge(db0, purchase.id, { amount: 7500, date: '2026-10-04', payment })
    expect(errors(db)).toEqual([])
    expect(t).toMatchObject({ linkedExpenseId: purchase.id, phaseId: purchase.phaseId, category: 'material', amount: 7500 })
    expect(phase(db, purchase.phaseId).actual.material).toBe(phase(db0, purchase.phaseId).actual.material + 7500)
    expect(purchaseLanding(db, purchase).landedCost).toBe(purchase.amount + 7500)
    const f0 = projectFinancials(db0, purchase.projectId), f = projectFinancials(db, purchase.projectId)
    if (payment.via === 'cash') expect(f.directPaid).toBe(f0.directPaid + 7500)
    if (payment.via === 'sameInvoice') expect(supplierInvoiceView(db, db.supplierInvoices.find((i) => i.id === 'SIN-019')!).amount).toBe(290500 + 7500)
    if (payment.via === 'transporter') expect(f.supplierInvoiced).toBe(f0.supplierInvoiced + 7500)
  })

  it('will not add lines to an invoice already settled with a discount', () => {
    const db = A.addSupplierPayment(createSeed(), { supplierInvoiceId: 'SIN-007', date: '2026-10-04', amount: 105000, discount: 3000, method: 'Bank Transfer', reference: 'D1' })
    expect(() => A.addTransportCharge(db, 'EXP-012', { amount: 4500, date: '2026-10-04', payment: { via: 'sameInvoice' } })).toThrow(/settled or discounted/)
    const [ok] = A.addTransportCharge(db, 'EXP-012', { amount: 4500, date: '2026-10-04', payment: { via: 'cash' } })
    expect(supplierInvoiceView(ok, ok.supplierInvoices.find((i) => i.id === 'SIN-007')!)).toMatchObject({ pending: 0, discount: 3000, status: 'Paid' })
  })

  it('deleting a purchase removes its transport and any invoice left empty', () => {
    const [d1, p] = A.addExpense(createSeed(), { projectId: 'PRJ-2026-001', phaseId: 'PH-003', category: 'material', subType: 'Sand', description: 'M-sand', date: '2026-10-04', quantity: 10, unit: 'Cu.m', rate: 1800, amount: 18000, supplierId: 'SUP-005' }, { mode: 'new', invoiceNumber: 'ABM/26/400', invoiceDate: '2026-10-04', dueDate: '2026-11-03' })
    const [d2] = A.addTransportCharge(d1, p.id, { amount: 2500, date: '2026-10-04', payment: { via: 'transporter', supplierId: 'SUP-008', invoiceNumber: 'SMT/26/100', invoiceDate: '2026-10-04', dueDate: '2026-11-03' } })
    const d3 = A.deleteExpense(d2, p.id)
    expect(errors(d3)).toEqual([])
    expect(d3.expenses).toHaveLength(createSeed().expenses.length)
    expect(d3.supplierInvoices).toHaveLength(createSeed().supplierInvoices.length)
  })
})

describe('the audit catches inconsistent data', () => {
  const corrupt = (fn: (db: Database) => void) => { const db = createSeed(); fn(db); return errors(db) }

  it('flags an amount that is not quantity × rate', () => {
    expect(corrupt((db) => { db.expenses[0].amount += 1 })).not.toEqual([])
  })
  it('flags an overpaid supplier invoice', () => {
    expect(corrupt((db) => { db.supplierPayments[0].amount += 1 })).not.toEqual([])
  })
  it('flags a phase status that contradicts its billing', () => {
    expect(corrupt((db) => { db.phases.find((p) => p.id === 'PH-001')!.status = 'Payment Received' })).not.toEqual([])
  })
  it('flags a project contract that differs from its phases', () => {
    expect(corrupt((db) => { db.projects[0].contractValue += 100000 })).not.toEqual([])
  })
})

describe('the full workflow keeps every figure consistent', () => {
  it('quote → contract → cost → supplier payment → completion → billing → payment → change order → closure', () => {
    let db = createSeed()
    const step = (next: Database) => { expect(errors(next)).toEqual([]); db = next }

    // 1. Convert the approved quotation
    const [d1, project] = A.convertQuotation(db, 'QT-2026-005', { projectManager: 'Eng. Arun Kumar', startDate: '2026-10-05', endDate: '2027-04-05' })
    step(d1)
    expect(project.status).toBe('Contract Pending')
    expect(projectFinancials(db, project.id).revenue).toBe(quotationTotals(db, 'QT-2026-005').value)
    const phases = db.phases.filter((p) => p.projectId === project.id)
    expect(phases).toHaveLength(4)
    expect(sum(phases.map((p) => p.budget.material + p.budget.labour + p.budget.outsource + p.budget.other))).toBe(quotationTotals(db, 'QT-2026-005').estimatedCost)

    // 2. Upload the signed contract
    const contract = db.contracts.find((c) => c.projectId === project.id)!
    step(A.uploadSignedContract(db, contract.id, 'Coastal_Signed_Contract.pdf', '2026-10-04')[0])
    expect(db.projects.find((p) => p.id === project.id)!.status).toBe('Active')

    // 3. Book an outsource cost on a Planned phase → phase starts, supplier invoice created
    const ph = phases[0]
    const before = portfolioSummary(db)
    const [d3, exp] = A.addExpense(db, { projectId: project.id, phaseId: ph.id, category: 'outsource', subType: 'Excavation', description: 'Site clearing', date: '2026-10-04', basis: 'rate', quantity: 5000, unit: 'Sq.ft', rate: 35, amount: 175000, supplierId: 'SUP-003' }, { mode: 'new', invoiceNumber: 'SES/120', invoiceDate: '2026-10-04', dueDate: '2026-11-03' })
    step(d3)
    expect(db.phases.find((p) => p.id === ph.id)!.status).toBe('In Progress')
    expect(portfolioSummary(db).actualCost).toBe(before.actualCost + 175000)
    expect(portfolioSummary(db).supplierPayable).toBe(before.supplierPayable + 175000)
    const sin = db.supplierInvoices.find((s) => s.id === exp.supplierInvoiceId)!

    // 4. Part-pay the supplier
    step(A.addSupplierPayment(db, { supplierInvoiceId: sin.id, date: '2026-10-04', amount: 100000, method: 'Bank Transfer', reference: 'T1' }))
    expect(supplierInvoiceView(db, sin).pending).toBe(75000)
    expect(supplierInvoiceView(db, sin).status).toBe('Partially Paid')

    // 5. Complete the phase → profit is recognised
    expect(phase(db, ph.id).actualProfit).toBe(0)
    step(A.setPhaseStatus(db, ph.id, 'Completed'))
    expect(phase(db, ph.id).actualProfit).toBe(ph.contractValue - 175000)

    // 6. Bill it in full → Billed; receive in full → Payment Received
    const [d6, inv] = A.addClientInvoice(db, { projectId: project.id, phaseId: ph.id, description: 'Site Development — final bill', invoiceDate: '2026-10-04', amount: ph.contractValue })
    step(d6)
    expect(db.phases.find((p) => p.id === ph.id)!.status).toBe('Billed')
    step(A.addClientPayment(db, { clientInvoiceId: inv.id, date: '2026-10-04', amount: 400000, method: 'Bank Transfer', reference: 'R1' }))
    expect(clientInvoicePaid(db, inv.id)).toBe(400000)
    step(A.addClientPayment(db, { clientInvoiceId: inv.id, date: '2026-10-04', amount: ph.contractValue - 400000, method: 'Cheque', reference: 'R2' }))
    expect(db.phases.find((p) => p.id === ph.id)!.status).toBe('Payment Received')
    expect(projectFinancials(db, project.id).clientPending).toBe(0)

    // 7. Approve a pending change order → revenue rises by exactly its value
    const gvBefore = projectFinancials(db, 'PRJ-2026-002').revenue
    step(A.approveChangeOrder(db, 'CO-002'))
    expect(projectFinancials(db, 'PRJ-2026-002').revenue).toBe(gvBefore + 250000)

    // 8. Close SRK → the closure snapshot equals the calculated figures
    const srk = projectFinancials(db, 'PRJ-2026-003')
    expect(canCloseProject(db, 'PRJ-2026-003').ready).toBe(true)
    step(A.closeProject(db, 'PRJ-2026-003', 'Admin'))
    expect(db.closures.at(-1)).toMatchObject({ finalRevenue: srk.revenue, finalCost: srk.actual.total, finalProfit: srk.actualProfit, clientPending: srk.clientPending, supplierPending: srk.supplierPending })
  })
})

describe('contract labour (per sq.ft)', () => {
  it('books area × rate as labour cost, paid at site, and passes the audit', () => {
    const db = createSeed()
    const ph = db.phases.find((p) => p.projectId === 'PRJ-2026-001' && p.status === 'In Progress')!
    const before = phaseFinancials(db, ph)
    const directBefore = projectFinancials(db, ph.projectId).directPaid
    const [next, exp] = A.addExpense(db, {
      projectId: ph.projectId, phaseId: ph.id, category: 'labour', subType: 'Mason', description: 'Brickwork contract — Selvam', date: '2026-10-04',
      labourBasis: 'contract', workerName: 'Selvam', quantity: 1200, unit: 'Sq.ft', rate: 45, amount: 54000,
    }, { mode: 'none' })
    expect(exp.supplierInvoiceId).toBeUndefined()
    expect(phaseFinancials(next, ph).actual.labour).toBe(before.actual.labour + 54000)
    expect(projectFinancials(next, ph.projectId).directPaid).toBe(directBefore + 54000)
    expect(auditDatabase(next)).toEqual([])
    const bad = { ...next, expenses: next.expenses.map((e) => (e.id === exp.id ? { ...e, amount: 50000 } : e)) }
    expect(errors(bad).map((i) => i.message)).toContain('contract labour 1200 × 45 ≠ 50000')
  })
})
