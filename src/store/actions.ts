import type {
  ChangeOrder, Client, ClientInvoice, ClientPayment, Contract, Database, DocumentRecord, Expense, Phase, PhaseBudget,
  PhaseStatus, Project, ProjectStatus, Quotation, QuotationItem, QuotationStatus, SupplierInvoice, SupplierPayment,
} from '../data/types'
import { addDays, today } from '../lib/format'
import { isPhaseDone, phaseBilling, projectFinancials, quotationTotals } from '../lib/calc'

// ---------------------------------------------------------------------------
// Mutations. Each is a pure (db, input) → db function. When the backend
// arrives, each maps to one endpoint (POST /expenses, PATCH /phases/:id …)
// and the store swaps local reducers for API calls + refetch.
// ---------------------------------------------------------------------------

/** nextId(db.expenses, 'EXP-') → 'EXP-075' */
export function nextId(list: { id: string }[], prefix: string, pad = 3): string {
  const max = list.reduce((m, x) => {
    if (!x.id.startsWith(prefix)) return m
    const n = Number(x.id.slice(prefix.length))
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}${String(max + 1).padStart(pad, '0')}`
}

const year = () => today().slice(0, 4)

const patch = <T extends { id: string }>(list: T[], id: string, changes: Partial<T>) =>
  list.map((x) => (x.id === id ? { ...x, ...changes } : x))

/** Phase status follows billing: fully billed → Billed, fully received → Payment Received. */
function syncPhaseBilling(db: Database, phaseId: string): Database {
  const phase = db.phases.find((p) => p.id === phaseId)
  if (!phase || !isPhaseDone(phase) || phase.status === 'Closed') return db
  const { billed, received } = phaseBilling(db, phaseId)
  let status: PhaseStatus = phase.status
  if (billed >= phase.contractValue) status = received >= phase.contractValue ? 'Payment Received' : 'Billed'
  return status === phase.status ? db : { ...db, phases: patch(db.phases, phaseId, { status }) }
}

// ---- Clients -----------------------------------------------------------------

export function addClient(db: Database, input: Omit<Client, 'id' | 'createdAt'>): [Database, Client] {
  const client: Client = { ...input, id: nextId(db.clients, 'CLI-'), createdAt: today() }
  return [{ ...db, clients: [...db.clients, client] }, client]
}

// ---- Quotations --------------------------------------------------------------

export function addQuotation(
  db: Database,
  input: Omit<Quotation, 'id' | 'status'> & { status?: QuotationStatus },
  items: Omit<QuotationItem, 'id' | 'quotationId'>[],
): [Database, Quotation] {
  const id = nextId(db.quotations, `QT-${year()}-`)
  const q: Quotation = { status: 'Draft', ...input, id }
  let quotationItems = db.quotationItems
  for (const it of items) quotationItems = [...quotationItems, { ...it, id: nextId(quotationItems, 'QI-'), quotationId: id }]
  return [{ ...db, quotations: [...db.quotations, q], quotationItems }, q]
}

export const setQuotationStatus = (db: Database, id: string, status: QuotationStatus): Database =>
  ({ ...db, quotations: patch(db.quotations, id, { status }) })

/** Approved quote → Project (Contract Pending) + phases from quote items + pending contract. */
export function convertQuotation(
  db: Database,
  quotationId: string,
  input: { projectManager: string; startDate: string; endDate: string },
): [Database, Project] {
  const q = db.quotations.find((x) => x.id === quotationId)!
  const { items, value } = quotationTotals(db, quotationId)
  const projectId = nextId(db.projects, `PRJ-${year()}-`)
  const project: Project = {
    id: projectId,
    name: q.projectName,
    shortName: q.projectName.split(/[–-]/)[0].trim(),
    clientId: q.clientId,
    quotationId,
    location: q.location,
    status: 'Contract Pending',
    contractValue: value,
    startDate: input.startDate,
    endDate: input.endDate,
    projectManager: input.projectManager,
  }
  let phases = db.phases
  items.forEach((it, i) => {
    // Default budget split until the engineer sets the phase budget.
    const c = it.estimatedCost
    const material = Math.round(c * 0.45), labour = Math.round(c * 0.25), other = Math.round(c * 0.05)
    phases = [...phases, {
      id: nextId(phases, 'PH-'), projectId, name: it.description, sequence: i + 1, contractValue: it.amount,
      budget: { material, labour, outsource: c - material - labour - other, other }, status: 'Planned', progress: 0,
    }]
  })
  const contract: Contract = {
    id: nextId(db.contracts, `CON-${year()}-`), projectId, clientId: q.clientId, value,
    startDate: input.startDate, endDate: input.endDate, status: 'Pending Signature',
  }
  return [{
    ...db,
    projects: [...db.projects, project],
    phases,
    contracts: [...db.contracts, contract],
    quotations: patch(db.quotations, quotationId, { projectId }),
  }, project]
}

// ---- Contracts & documents ---------------------------------------------------

export function addDocument(db: Database, input: Omit<DocumentRecord, 'id' | 'uploadedAt'>): [Database, DocumentRecord] {
  const doc: DocumentRecord = { ...input, id: nextId(db.documents, 'DOC-'), uploadedAt: today() }
  return [{ ...db, documents: [...db.documents, doc] }, doc]
}

/** Simulated upload of the signed contract: contract → Active, project → Active. */
export function uploadSignedContract(db: Database, contractId: string, fileName: string, signedDate: string): Database {
  const c = db.contracts.find((x) => x.id === contractId)!
  const project = db.projects.find((p) => p.id === c.projectId)!
  const [db2, doc] = addDocument(db, {
    name: fileName, type: 'Signed Contract', entityType: 'Contract', entityId: contractId, projectId: c.projectId,
    uploadedBy: project.projectManager, sizeKb: 1800 + Math.round(Math.random() * 1200),
  })
  return {
    ...db2,
    contracts: patch(db2.contracts, contractId, { status: 'Active', signedDate, documentId: doc.id }),
    projects: patch(db2.projects, c.projectId, { status: project.status === 'Contract Pending' ? 'Active' : project.status }),
  }
}

// ---- Projects & phases -------------------------------------------------------

export const setProjectStatus = (db: Database, id: string, status: ProjectStatus): Database =>
  ({ ...db, projects: patch(db.projects, id, { status }) })

export function addPhase(db: Database, input: Omit<Phase, 'id' | 'sequence' | 'status' | 'progress'>): [Database, Phase] {
  const seq = db.phases.filter((p) => p.projectId === input.projectId).reduce((m, p) => Math.max(m, p.sequence), 0)
  const phase: Phase = { ...input, id: nextId(db.phases, 'PH-'), sequence: seq + 1, status: 'Planned', progress: 0 }
  return [{ ...db, phases: [...db.phases, phase] }, phase]
}

export const setPhaseBudget = (db: Database, phaseId: string, budget: PhaseBudget, contractValue?: number): Database =>
  ({ ...db, phases: patch(db.phases, phaseId, contractValue === undefined ? { budget } : { budget, contractValue }) })

export function setPhaseStatus(db: Database, phaseId: string, status: PhaseStatus): Database {
  const phase = db.phases.find((p) => p.id === phaseId)!
  const changes: Partial<Phase> = { status }
  if (['Completed', 'Billed', 'Payment Received', 'Closed'].includes(status)) {
    changes.progress = 100
    changes.endDate = phase.endDate ?? today()
  }
  if (status === 'In Progress') {
    changes.startDate = phase.startDate ?? today()
    if (phase.progress >= 100) changes.progress = 90
  }
  if (status === 'Planned') changes.progress = 0
  let next: Database = { ...db, phases: patch(db.phases, phaseId, changes) }
  // A project with work in progress becomes Active; all phases done → Completed.
  const project = next.projects.find((p) => p.id === phase.projectId)!
  const all = next.phases.filter((p) => p.projectId === project.id)
  if (project.status === 'Active' && all.every(isPhaseDone)) next = setProjectStatus(next, project.id, 'Completed')
  if (project.status === 'Completed' && !all.every(isPhaseDone)) next = setProjectStatus(next, project.id, 'Active')
  return next
}

export const setPhaseProgress = (db: Database, phaseId: string, progress: number): Database => {
  const p = db.phases.find((x) => x.id === phaseId)!
  const status: PhaseStatus = p.status === 'Planned' && progress > 0 ? 'In Progress' : p.status
  return { ...db, phases: patch(db.phases, phaseId, { progress: Math.max(0, Math.min(100, progress)), status }) }
}

// ---- Expenses & supplier invoices -------------------------------------------

export type SupplierInvoiceInput =
  | { mode: 'none' }
  | { mode: 'existing'; supplierInvoiceId: string }
  | { mode: 'new'; invoiceNumber: string; invoiceDate: string; dueDate: string }

export function addExpense(db: Database, input: Omit<Expense, 'id' | 'supplierInvoiceId'>, invoice: SupplierInvoiceInput): [Database, Expense] {
  let next = db
  let supplierInvoiceId: string | undefined
  if (input.supplierId && invoice.mode === 'existing') supplierInvoiceId = invoice.supplierInvoiceId
  if (input.supplierId && invoice.mode === 'new') {
    const sin: SupplierInvoice = {
      id: nextId(db.supplierInvoices, 'SIN-'), supplierId: input.supplierId, projectId: input.projectId,
      invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate,
    }
    next = { ...next, supplierInvoices: [...next.supplierInvoices, sin] }
    supplierInvoiceId = sin.id
  }
  const expense: Expense = { ...input, id: nextId(db.expenses, 'EXP-'), supplierInvoiceId }
  return [{ ...next, expenses: [...next.expenses, expense] }, expense]
}

export function deleteExpense(db: Database, expenseId: string): Database {
  const exp = db.expenses.find((e) => e.id === expenseId)
  let next: Database = { ...db, expenses: db.expenses.filter((e) => e.id !== expenseId) }
  // Drop an invoice left with no lines and no payments.
  const sinId = exp?.supplierInvoiceId
  if (sinId && !next.expenses.some((e) => e.supplierInvoiceId === sinId) && !next.supplierPayments.some((p) => p.supplierInvoiceId === sinId))
    next = { ...next, supplierInvoices: next.supplierInvoices.filter((s) => s.id !== sinId) }
  return next
}

export function addSupplierPayment(db: Database, input: Omit<SupplierPayment, 'id'>): Database {
  return { ...db, supplierPayments: [...db.supplierPayments, { ...input, id: nextId(db.supplierPayments, 'SPAY-') }] }
}

// ---- Client billing ----------------------------------------------------------

export function addClientInvoice(db: Database, input: Omit<ClientInvoice, 'id' | 'invoiceNumber' | 'dueDate'> & { dueDate?: string }): [Database, ClientInvoice] {
  const id = nextId(db.clientInvoices, 'CINV-')
  const invoiceNumber = nextId(db.clientInvoices.map((i) => ({ id: i.invoiceNumber })), `INV-${year()}-`)
  const inv: ClientInvoice = { ...input, id, invoiceNumber, dueDate: input.dueDate ?? addDays(input.invoiceDate, 15) }
  return [syncPhaseBilling({ ...db, clientInvoices: [...db.clientInvoices, inv] }, inv.phaseId), inv]
}

export function addClientPayment(db: Database, input: Omit<ClientPayment, 'id'>): Database {
  const inv = db.clientInvoices.find((i) => i.id === input.clientInvoiceId)!
  return syncPhaseBilling({ ...db, clientPayments: [...db.clientPayments, { ...input, id: nextId(db.clientPayments, 'PAY-') }] }, inv.phaseId)
}

// ---- Change orders -----------------------------------------------------------

export function addChangeOrder(db: Database, input: Omit<ChangeOrder, 'id' | 'number' | 'status'>): [Database, ChangeOrder] {
  const co: ChangeOrder = {
    ...input, id: nextId(db.changeOrders, 'CO-'),
    number: nextId(db.changeOrders.map((c) => ({ id: c.number })), `CO-${year()}-`), status: 'Pending Approval',
  }
  return [{ ...db, changeOrders: [...db.changeOrders, co] }, co]
}

/** Approval adds revenue to the project and creates a phase to track its cost. */
export function approveChangeOrder(db: Database, coId: string): Database {
  const co = db.changeOrders.find((c) => c.id === coId)!
  const c = co.estimatedCost
  const material = Math.round(c * 0.5), labour = Math.round(c * 0.3), other = Math.round(c * 0.03)
  const [next, phase] = addPhase(db, {
    projectId: co.projectId, name: `${co.description} (${co.number})`, contractValue: co.revenue,
    budget: { material, labour, outsource: c - material - labour - other, other }, changeOrderId: co.id,
  })
  return { ...next, changeOrders: patch(next.changeOrders, coId, { status: 'Approved', approvedDate: today(), phaseId: phase.id }) }
}

export const rejectChangeOrder = (db: Database, coId: string): Database =>
  ({ ...db, changeOrders: patch(db.changeOrders, coId, { status: 'Rejected' }) })

// ---- Closure -----------------------------------------------------------------

export function closeProject(db: Database, projectId: string, closedBy: string, notes?: string): Database {
  const f = projectFinancials(db, projectId)
  return {
    ...db,
    projects: patch(db.projects, projectId, { status: 'Closed' }),
    phases: db.phases.map((p) => (p.projectId === projectId ? { ...p, status: 'Closed' as PhaseStatus, progress: 100 } : p)),
    contracts: db.contracts.map((c) => (c.projectId === projectId && c.status !== 'Cancelled' ? { ...c, status: 'Completed' as const } : c)),
    closures: [...db.closures, {
      id: nextId(db.closures, 'CLS-'), projectId, closedDate: today(), closedBy, notes,
      finalRevenue: f.revenue, finalCost: f.actual.total, finalProfit: f.actualProfit,
      clientPending: f.clientPending, supplierPending: f.supplierPending,
    }],
  }
}
