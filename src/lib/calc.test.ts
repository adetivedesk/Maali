import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import type { Database } from '../data/types'
import * as A from '../store/actions'
import { auditDatabase } from './audit'
import {
  canCloseProject, clientInvoicePaid, phaseFinancials, portfolioSummary, projectFinancials, quotationTotals, supplierInvoiceView,
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
    expect(f.supplierPending).toBe(f.supplierInvoiced - f.supplierPaid)
    expect(f.cashPosition).toBe(f.received - f.supplierPaid - f.directPaid)
    // every rupee of cost is either a supplier invoice or a direct site payment
    expect(f.actual.total).toBe(f.supplierInvoiced + f.directPaid)
    expect(f.forecastProfit).toBe(f.revenue - f.estimateAtCompletion)
  })

  it('portfolio totals equal the sum of projects', () => {
    const fins = db.projects.map((p) => projectFinancials(db, p.id))
    expect(s.contractValue).toBe(sum(fins.map((f) => f.revenue)))
    expect(s.actualCost).toBe(sum(db.expenses.map((e) => e.amount)))
    expect(s.billed).toBe(sum(db.clientInvoices.map((i) => i.amount)))
    expect(s.received).toBe(sum(db.clientPayments.map((p) => p.amount)))
    expect(s.supplierPaid).toBe(sum(db.supplierPayments.map((p) => p.amount)))
    expect(s.clientReceivable).toBe(s.billed - s.received)
    expect(s.supplierPayable).toBe(s.supplierInvoiced - s.supplierPaid)
    expect(s.actualProfit).toBe(sum(fins.map((f) => f.actualProfit)))
    expect(s.wipCost).toBe(sum(fins.map((f) => f.wipCost)))
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
    step(A.uploadSignedContract(db, contract.id, 'Coastal_Signed_Contract.pdf', '2026-10-04'))
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
