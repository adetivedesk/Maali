import type {
  ChangeOrder, Client, ClientInvoice, ClientPayment, Database, DocumentRecord, Expense, Phase, PhaseBudget, PhaseStatus,
  Project, ProjectStatus, Quotation, QuotationItem, QuotationStatus, SupplierPayment,
} from '../data/types'
import { canCloseProject } from '../lib/calc'
import type { Level, MenuKey } from '../lib/permissions'
import * as A from './actions'

// ---------------------------------------------------------------------------
// Every change to the data is a named command. The browser asks the server to
// run it; the server checks the user's role for (menu, level), runs the same
// pure action on the latest data, validates the result and saves it. In the
// browser-only demo the store runs the command locally.
// ---------------------------------------------------------------------------

export interface Ctx { user: string }

type Run<Args extends unknown[], R> = (db: Database, ctx: Ctx, ...args: Args) => [Database, R]
interface Command<Args extends unknown[], R> { menu: MenuKey; level: Level; run: Run<Args, R> }
const cmd = <Args extends unknown[], R>(menu: MenuKey, level: Level, run: Run<Args, R>): Command<Args, R> => ({ menu, level, run })
const only = (db: Database): [Database, void] => [db, undefined]

// ---- input checks (the server never trusts the form) -------------------------

const rule: (ok: unknown, message: string) => asserts ok = A.rule
const text = (v: unknown, label: string) => rule(typeof v === 'string' && v.trim(), `${label} is required`)
const amount = (v: unknown, label: string, min = 0.01) => rule(typeof v === 'number' && Number.isFinite(v) && v >= min, `${label} must be a number of at least ${min}`)
const date = (v: unknown, label: string) => rule(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v), `${label} must be a date`)
const found = <T extends { id: string }>(list: T[], id: unknown, label: string): T => {
  const x = list.find((r) => r.id === id)
  if (!x) throw A.ruleError(`${label} ${String(id)} not found`)
  return x
}
const notClosed = (db: Database, projectId: string) => {
  const p = found(db.projects, projectId, 'Project')
  rule(p.status !== 'Closed', `${p.shortName} is closed; no further changes are allowed`)
}

export type TransportInput = { amount: number; date: string; note?: string; payment: A.TransportPayment }

export const COMMANDS = {
  // ---- clients & suppliers ----
  addClient: cmd('clients', 'write', (db, _c, input: Omit<Client, 'id' | 'createdAt'>): [Database, Client] => {
    text(input?.name, 'Client name'); text(input.contactPerson, 'Contact person')
    return A.addClient(db, input)
  }),
  deleteClient: cmd('clients', 'delete', (db, _c, id: string) => only(A.deleteClient(db, id))),
  deleteSupplier: cmd('suppliers', 'delete', (db, _c, id: string) => only(A.deleteSupplier(db, id))),

  // ---- quotations ----
  addQuotation: cmd('quotations', 'write', (db, _c, input: Omit<Quotation, 'id' | 'status'> & { status?: QuotationStatus }, items: Omit<QuotationItem, 'id' | 'quotationId'>[]): [Database, Quotation] => {
    found(db.clients, input?.clientId, 'Client'); text(input.projectName, 'Project name'); date(input.quoteDate, 'Quote date'); date(input.validUntil, 'Valid until')
    rule(input.status === undefined || input.status === 'Draft' || input.status === 'Sent', 'A new quotation is saved as Draft or Sent')
    rule(Array.isArray(items) && items.length > 0, 'Add at least one line item')
    items.forEach((it, i) => { text(it.description, `Item ${i + 1} description`); amount(it.amount, `Item ${i + 1} amount`); amount(it.estimatedCost, `Item ${i + 1} estimated cost`, 0) })
    return A.addQuotation(db, input, items)
  }),
  setQuotationStatus: cmd('quotations', 'write', (db, _c, id: string, status: QuotationStatus) => {
    const q = found(db.quotations, id, 'Quotation')
    rule(!q.projectId, `${id} is already converted to a project`)
    return only(A.setQuotationStatus(db, id, status))
  }),
  deleteQuotation: cmd('quotations', 'delete', (db, _c, id: string) => only(A.deleteQuotation(db, id))),
  convertQuotation: cmd('projects', 'write', (db, _c, id: string, input: { projectManager: string; startDate: string; endDate: string }): [Database, Project] => {
    const q = found(db.quotations, id, 'Quotation')
    rule(q.status === 'Approved' && !q.projectId, `${id} must be Approved and not yet converted`)
    text(input?.projectManager, 'Project manager'); date(input.startDate, 'Start date'); date(input.endDate, 'End date')
    return A.convertQuotation(db, id, input)
  }),

  // ---- contracts & projects ----
  uploadSignedContract: cmd('contracts', 'write', (db, ctx, contractId: string, fileName: string, signedDate: string, sizeKb?: number): [Database, DocumentRecord] => {
    const c = found(db.contracts, contractId, 'Contract')
    rule(c.status === 'Pending Signature', `${contractId} is already ${c.status}`)
    text(fileName, 'File name'); date(signedDate, 'Signed date')
    return A.uploadSignedContract(db, contractId, fileName, signedDate, { uploadedBy: ctx.user, sizeKb: Math.max(1, Math.round(sizeKb ?? 1)) })
  }),
  setProjectStatus: cmd('projects', 'write', (db, _c, id: string, status: ProjectStatus) => {
    const p = found(db.projects, id, 'Project')
    rule((p.status === 'Active' && status === 'On Hold') || (p.status === 'On Hold' && status === 'Active'), `Cannot move ${p.shortName} from ${p.status} to ${status}`)
    return only(A.setProjectStatus(db, id, status))
  }),
  closeProject: cmd('projects', 'write', (db, ctx, id: string, notes?: string) => {
    const p = found(db.projects, id, 'Project')
    const check = canCloseProject(db, id)
    rule(check.ready, `${p.shortName} cannot be closed yet: ${check.checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}`)
    return only(A.closeProject(db, id, ctx.user, notes || undefined))
  }),
  addChangeOrder: cmd('projects', 'write', (db, _c, input: Omit<ChangeOrder, 'id' | 'number' | 'status'>, approve: boolean): [Database, ChangeOrder] => {
    notClosed(db, input?.projectId); text(input.description, 'Description'); amount(input.revenue, 'Revenue'); amount(input.estimatedCost, 'Estimated cost', 0)
    let [next, co] = A.addChangeOrder(db, input)
    if (approve) next = A.approveChangeOrder(next, co.id)
    return [next, next.changeOrders.find((c) => c.id === co.id)!]
  }),
  approveChangeOrder: cmd('projects', 'write', (db, _c, id: string) => {
    rule(found(db.changeOrders, id, 'Change order').status === 'Pending Approval', `${id} is not pending approval`)
    return only(A.approveChangeOrder(db, id))
  }),
  rejectChangeOrder: cmd('projects', 'write', (db, _c, id: string) => {
    rule(found(db.changeOrders, id, 'Change order').status === 'Pending Approval', `${id} is not pending approval`)
    return only(A.rejectChangeOrder(db, id))
  }),

  // ---- phases ----
  savePhase: cmd('phases', 'write', (db, _c, existingId: string | null, input: { projectId: string; name: string; contractValue?: number; budget: PhaseBudget }): [Database, Phase] => {
    for (const [k, v] of Object.entries(input?.budget ?? {})) amount(v, `Budget ${k}`, 0)
    if (existingId) {
      const ph = found(db.phases, existingId, 'Phase')
      notClosed(db, ph.projectId)
      if (input.contractValue !== undefined) { rule(!ph.changeOrderId, 'A change-order phase takes its value from the change order'); amount(input.contractValue, 'Phase value') }
      const next = A.setPhaseBudget(db, existingId, input.budget, input.contractValue)
      return [next, next.phases.find((p) => p.id === existingId)!]
    }
    notClosed(db, input.projectId); text(input.name, 'Phase name'); amount(input.contractValue, 'Phase value')
    return A.addPhase(db, { projectId: input.projectId, name: input.name, contractValue: input.contractValue!, budget: input.budget })
  }),
  setPhaseStatus: cmd('phases', 'write', (db, _c, id: string, status: PhaseStatus) => {
    notClosed(db, found(db.phases, id, 'Phase').projectId)
    rule(status !== 'Closed', 'Phases are closed by closing the project')
    return only(A.setPhaseStatus(db, id, status))
  }),
  setPhaseProgress: cmd('phases', 'write', (db, _c, id: string, progress: number) => {
    notClosed(db, found(db.phases, id, 'Phase').projectId); amount(progress, 'Progress', 0)
    return only(A.setPhaseProgress(db, id, progress))
  }),
  deletePhase: cmd('phases', 'delete', (db, _c, id: string) => only(A.deletePhase(db, id))),

  // ---- expenses ----
  addExpense: cmd('expenses', 'write', (db, _c, input: Omit<Expense, 'id' | 'supplierInvoiceId'>, invoice: A.SupplierInvoiceInput, transport?: TransportInput): [Database, Expense] => {
    notClosed(db, input?.projectId)
    rule(found(db.phases, input.phaseId, 'Phase').projectId === input.projectId, 'Phase does not belong to the project')
    if (input.supplierId) found(db.suppliers, input.supplierId, 'Supplier')
    text(input.description, 'Description'); date(input.date, 'Date'); amount(input.amount, 'Amount')
    if (invoice?.mode === 'new') { text(invoice.invoiceNumber, 'Supplier invoice number'); date(invoice.invoiceDate, 'Invoice date'); date(invoice.dueDate, 'Due date') }
    let [next, exp] = A.addExpense(db, input, invoice)
    if (transport) { amount(transport.amount, 'Transport amount'); [next] = A.addTransportCharge(next, exp.id, transport) }
    return [next, exp]
  }),
  addTransportCharge: cmd('expenses', 'write', (db, _c, purchaseId: string, input: TransportInput): [Database, Expense] => {
    notClosed(db, found(db.expenses, purchaseId, 'Purchase').projectId); amount(input?.amount, 'Amount'); date(input.date, 'Date')
    return A.addTransportCharge(db, purchaseId, input)
  }),
  deleteExpense: cmd('expenses', 'delete', (db, _c, id: string) => {
    notClosed(db, found(db.expenses, id, 'Expense').projectId)
    return only(A.deleteExpense(db, id))
  }),

  // ---- billing & payments ----
  addClientInvoice: cmd('billing', 'write', (db, _c, input: Omit<ClientInvoice, 'id' | 'invoiceNumber' | 'dueDate'> & { dueDate?: string }): [Database, ClientInvoice] => {
    notClosed(db, input?.projectId)
    rule(found(db.phases, input.phaseId, 'Phase').projectId === input.projectId, 'Phase does not belong to the project')
    text(input.description, 'Description'); date(input.invoiceDate, 'Invoice date'); amount(input.amount, 'Amount')
    return A.addClientInvoice(db, input)
  }),
  cancelClientInvoice: cmd('billing', 'delete', (db, ctx, id: string, reason: string) => only(A.cancelClientInvoice(db, id, reason, ctx.user))),
  addClientPayment: cmd('payments', 'write', (db, _c, input: Omit<ClientPayment, 'id'>) => {
    notClosed(db, found(db.clientInvoices, input?.clientInvoiceId, 'Invoice').projectId); date(input.date, 'Date'); amount(input.amount, 'Amount')
    return only(A.addClientPayment(db, input))
  }),
  cancelClientPayment: cmd('payments', 'delete', (db, ctx, id: string, reason: string) => only(A.cancelClientPayment(db, id, reason, ctx.user))),
  addSupplierPayment: cmd('payments', 'write', (db, _c, input: Omit<SupplierPayment, 'id'>) => {
    notClosed(db, found(db.supplierInvoices, input?.supplierInvoiceId, 'Supplier invoice').projectId); date(input.date, 'Date')
    amount(input.amount, 'Amount', 0); if (input.discount !== undefined) amount(input.discount, 'Discount', 0)
    rule(input.amount + (input.discount ?? 0) > 0, 'Enter an amount or a discount')
    return only(A.addSupplierPayment(db, input))
  }),
  cancelSupplierPayment: cmd('payments', 'delete', (db, ctx, id: string, reason: string) => only(A.cancelSupplierPayment(db, id, reason, ctx.user))),

  // ---- documents ----
  addDocument: cmd('documents', 'write', (db, ctx, input: Omit<DocumentRecord, 'id' | 'uploadedAt' | 'uploadedBy'>): [Database, DocumentRecord] => {
    text(input?.name, 'File name')
    if (input.projectId) found(db.projects, input.projectId, 'Project')
    return A.addDocument(db, { ...input, uploadedBy: ctx.user, sizeKb: Math.max(1, Math.round(input.sizeKb || 1)) })
  }),
  deleteDocument: cmd('documents', 'delete', (db, _c, id: string) => only(A.deleteDocument(db, id))),
}

export type CommandName = keyof typeof COMMANDS
type CommandOf<K extends CommandName> = (typeof COMMANDS)[K]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandArgs<K extends CommandName> = CommandOf<K>['run'] extends (db: Database, ctx: Ctx, ...args: infer P) => any ? P : never
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandResult<K extends CommandName> = CommandOf<K>['run'] extends (...args: any[]) => [Database, infer R] ? R : never

export const isCommandName = (n: unknown): n is CommandName => typeof n === 'string' && Object.hasOwn(COMMANDS, n)

/** Commands that store an uploaded file against the document they create. */
export const FILE_COMMANDS: CommandName[] = ['addDocument', 'uploadSignedContract']

export function runCommand(db: Database, ctx: Ctx, name: CommandName, args: unknown[]): [Database, unknown] {
  const c = COMMANDS[name] as Command<unknown[], unknown>
  return c.run(db, ctx, ...args)
}
