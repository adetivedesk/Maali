import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed'
import type { Database } from '../data/types'
import { auditDatabase } from '../lib/audit'
import { can, DEFAULT_ROLES, fullAccess, normalizePermissions } from '../lib/permissions'
import { validateTransition } from '../../api/_lib/execute'
import { isRuleError, withCounters } from './actions'
import { COMMANDS, runCommand, type CommandName } from './commands'
import { applyChanges, diffDatabase } from './sync'

const ctx = { user: 'Test User' }
const run = (db: Database, name: CommandName, ...args: unknown[]) => runCommand(db, ctx, name, args)
const hardErrors = (db: Database) => auditDatabase(db).filter((i) => i.level === 'error' && !i.soft)
const ruleMessage = (fn: () => unknown) => {
  try { fn() } catch (e) { if (isRuleError(e)) return e.message; throw e }
  return null
}

describe('number series (server counters)', () => {
  it('never reuses a number after the record is deleted', () => {
    const counters: Record<string, number> = {}
    const db0 = createSeed()
    const input = { name: 'A', contactPerson: 'B', phone: '', email: '', city: 'Chennai', state: 'Tamil Nadu' }
    const [db1, c1] = withCounters(counters, () => run(db0, 'addClient', input)) as [Database, { id: string }]
    const [db2] = withCounters(counters, () => run(db1, 'deleteClient', c1.id))
    const [, c2] = withCounters(counters, () => run(db2, 'addClient', input)) as [Database, { id: string }]
    expect(c1.id).toBe('CLI-007')
    expect(c2.id).toBe('CLI-008')
    expect(counters['CLI-']).toBe(8)
  })

  it('cancelled invoice numbers are not issued again', () => {
    const counters: Record<string, number> = {}
    let db = createSeed()
    const phase = db.phases.find((p) => p.status === 'In Progress')!
    const bill = { projectId: phase.projectId, phaseId: phase.id, description: 'Running bill', invoiceDate: '2026-10-04', amount: 1000 }
    let first: { id: string; invoiceNumber: string }
    ;[db, first] = withCounters(counters, () => run(db, 'addClientInvoice', bill)) as [Database, typeof first]
    ;[db] = withCounters(counters, () => run(db, 'cancelClientInvoice', first.id, 'Raised in error'))
    const [, second] = withCounters(counters, () => run(db, 'addClientInvoice', bill)) as [Database, typeof first]
    expect(second.invoiceNumber).not.toBe(first.invoiceNumber)
    expect(second.id).not.toBe(first.id)
    expect(db.cancelled[0].record).toMatchObject({ invoiceNumber: first.invoiceNumber })
  })
})

describe('cancel (void) keeps history and totals consistent', () => {
  it('cancelling a receipt moves it to cancelled and steps the phase back from Payment Received', () => {
    const db = createSeed()
    const phase = db.phases.find((p) => p.status === 'Payment Received')!
    const inv = db.clientInvoices.find((i) => i.phaseId === phase.id)!
    const pay = db.clientPayments.find((p) => p.clientInvoiceId === inv.id)!
    const [next] = run(db, 'cancelClientPayment', pay.id, 'Cheque bounced')
    expect(next.clientPayments.some((p) => p.id === pay.id)).toBe(false)
    expect(next.cancelled).toHaveLength(1)
    expect(next.cancelled[0]).toMatchObject({ collection: 'clientPayments', recordId: pay.id, reason: 'Cheque bounced', cancelledBy: 'Test User' })
    expect(next.phases.find((p) => p.id === phase.id)!.status).toBe('Billed')
    expect(hardErrors(next)).toEqual([])
  })

  it('an invoice with payments cannot be cancelled, and a reason is required', () => {
    const db = createSeed()
    const paid = db.clientInvoices.find((i) => db.clientPayments.some((p) => p.clientInvoiceId === i.id))!
    expect(ruleMessage(() => run(db, 'cancelClientInvoice', paid.id, 'x'))).toMatch(/has payments/)
    const pay = db.supplierPayments[0]
    expect(ruleMessage(() => run(db, 'cancelSupplierPayment', pay.id, '  '))).toMatch(/reason is required/)
  })
})

describe('safe delete', () => {
  it('blocks deleting records that others depend on', () => {
    const db = createSeed()
    expect(ruleMessage(() => run(db, 'deleteClient', db.projects[0].clientId))).toMatch(/quotations or projects/)
    expect(ruleMessage(() => run(db, 'deleteSupplier', db.expenses.find((e) => e.supplierId)!.supplierId!))).toMatch(/purchases or invoices/)
    const signed = db.contracts.find((c) => c.documentId)!.documentId!
    expect(ruleMessage(() => run(db, 'deleteDocument', signed))).toMatch(/signed contract/)
    const started = db.phases.find((p) => p.status === 'In Progress')!
    expect(ruleMessage(() => run(db, 'deletePhase', started.id))).toMatch(/Only planned phases/)
  })

  it('deletes a draft quotation with its items', () => {
    let db = createSeed()
    ;[db] = run(db, 'addQuotation', { clientId: db.clients[0].id, projectName: 'Shed', location: 'Madurai', quoteDate: '2026-10-01', validUntil: '2026-10-31', status: 'Draft' }, [{ description: 'Roof', amount: 100000, estimatedCost: 70000 }])
    const q = db.quotations[db.quotations.length - 1]
    const [next] = run(db, 'deleteQuotation', q.id)
    expect(next.quotations.some((x) => x.id === q.id)).toBe(false)
    expect(next.quotationItems.some((i) => i.quotationId === q.id)).toBe(false)
  })
})

describe('server-side input checks', () => {
  it('rejects bad amounts and unknown references before touching data', () => {
    const db = createSeed()
    const phase = db.phases.find((p) => p.status === 'In Progress')!
    const bad = { projectId: phase.projectId, phaseId: phase.id, description: 'x', invoiceDate: '2026-10-04' }
    expect(ruleMessage(() => run(db, 'addClientInvoice', { ...bad, amount: -5 }))).toMatch(/Amount/)
    expect(ruleMessage(() => run(db, 'addClientInvoice', { ...bad, amount: Number.NaN }))).toMatch(/Amount/)
    expect(ruleMessage(() => run(db, 'addClientInvoice', { ...bad, phaseId: 'PH-999', amount: 10 }))).toMatch(/not found/)
    expect(ruleMessage(() => run(db, 'addClient', { name: ' ', contactPerson: 'x' }))).toMatch(/Client name/)
  })

  it('validateTransition rejects new integrity errors but allows agreed-value drift', () => {
    const db = createSeed()
    // Overpayment: receipt larger than its invoice → hard error.
    const inv = db.clientInvoices[0]
    const over: Database = { ...db, clientPayments: [...db.clientPayments, { id: 'PAY-999', clientInvoiceId: inv.id, date: '2026-10-04', amount: inv.amount * 10, method: 'Cash', reference: 'x' }] }
    expect(() => validateTransition(db, over)).toThrow(/inconsistent/)
    // Adding a phase changes the sum of phases vs. the contract: soft, allowed.
    const p = db.projects.find((x) => x.status === 'Active')!
    const [withPhase] = run(db, 'savePhase', null, { projectId: p.id, name: 'Extra', contractValue: 50000, budget: { material: 1, labour: 1, outsource: 1, other: 1 } })
    expect(() => validateTransition(db, withPhase)).not.toThrow()
  })

  it('every command declares a menu and level', () => {
    for (const [name, c] of Object.entries(COMMANDS)) {
      expect(['read', 'write', 'delete'], name).toContain(c.level)
      expect(c.menu, name).toBeTruthy()
    }
  })
})

describe('permissions', () => {
  it('write or delete implies read; administrator has everything', () => {
    const p = normalizePermissions({ expenses: { delete: true } })
    expect(p.expenses).toEqual({ read: true, write: false, delete: true })
    expect(can(p, 'billing', 'read')).toBe(false)
    expect(Object.values(fullAccess()).every((a) => a.read && a.write && a.delete)).toBe(true)
  })

  it('site engineers can record costs but not bill or see users', () => {
    const site = DEFAULT_ROLES.find((r) => r.id === 'ROLE-SITE')!.permissions
    expect(can(site, 'expenses', 'write')).toBe(true)
    expect(can(site, 'expenses', 'delete')).toBe(false)
    expect(can(site, 'billing', 'read')).toBe(false)
    expect(can(site, 'users', 'read')).toBe(false)
  })
})

describe('sync', () => {
  it('applyChanges(prev, diff(prev, next)) reproduces next', () => {
    const db = createSeed()
    const phase = db.phases.find((p) => p.status === 'In Progress')!
    const [next] = run(db, 'addExpense', { projectId: phase.projectId, phaseId: phase.id, category: 'other', subType: 'Misc', description: 'Site water', date: '2026-10-04', amount: 1200 }, { mode: 'none' })
    const [final] = run(next, 'deleteExpense', next.expenses[0].id)
    expect(applyChanges(db, diffDatabase(db, final))).toEqual(final)
  })
})
