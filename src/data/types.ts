// Domain entities. Each interface maps 1:1 to a future database table so the
// demo seed can be replaced by REST/API responses without touching the UI.
// Derived values (totals, pending amounts, statuses based on balances) are
// never stored here — they are computed in src/lib/calc.ts.

export type ISODate = string // 'YYYY-MM-DD'

export interface Client {
  id: string // CLI-001
  name: string
  contactPerson: string
  phone: string
  email: string
  city: string
  state: string
  createdAt: ISODate
}

export type ProjectStatus =
  | 'Draft'
  | 'Quotation'
  | 'Awaiting Approval'
  | 'Approved'
  | 'Contract Pending'
  | 'Active'
  | 'On Hold'
  | 'Completed'
  | 'Closed'
  | 'Cancelled'
  | 'Rejected'

export interface Project {
  id: string // PRJ-2026-001
  name: string
  shortName: string
  clientId: string
  quotationId?: string
  location: string
  status: ProjectStatus
  /** Original signed contract value (excludes change orders). */
  contractValue: number
  startDate: ISODate
  endDate: ISODate
  projectManager: string
  description?: string
}

export type QuotationStatus = 'Draft' | 'Sent' | 'Under Review' | 'Approved' | 'Rejected' | 'Expired'

export interface QuotationItem {
  id: string // QI-001
  quotationId: string
  description: string // becomes a project phase on conversion
  amount: number
  estimatedCost: number
}

export interface Quotation {
  id: string // QT-2026-001
  clientId: string
  projectName: string
  location: string
  quoteDate: ISODate
  validUntil: ISODate
  status: QuotationStatus
  projectId?: string // set when converted
  notes?: string
}

export type ContractStatus = 'Pending Signature' | 'Signed' | 'Active' | 'Completed' | 'Cancelled'

export interface Contract {
  id: string // CON-2026-001
  projectId: string
  clientId: string
  value: number
  startDate: ISODate
  endDate: ISODate
  signedDate?: ISODate
  documentId?: string
  status: ContractStatus
}

export type PhaseStatus = 'Planned' | 'In Progress' | 'Completed' | 'Billed' | 'Payment Received' | 'Closed'

export const PHASE_STATUSES: PhaseStatus[] = ['Planned', 'In Progress', 'Completed', 'Billed', 'Payment Received', 'Closed']

export type CostCategory = 'material' | 'labour' | 'outsource' | 'other'

/** phase_budgets — planned cost per category. */
export type PhaseBudget = Record<CostCategory, number>

export interface Phase {
  id: string // PH-001
  projectId: string
  name: string
  sequence: number
  contractValue: number
  budget: PhaseBudget
  status: PhaseStatus
  /** Physical progress 0–100 entered by site engineer. */
  progress: number
  startDate?: ISODate
  endDate?: ISODate
  changeOrderId?: string
}

export type OutsourceBasis = 'fixed' | 'rate'

export interface Expense {
  id: string // EXP-001
  projectId: string
  phaseId: string
  category: CostCategory
  /** Cement / Steel / Mason / Excavation … */
  subType: string
  description: string
  date: ISODate
  amount: number
  // material + rate-based outsource
  quantity?: number
  unit?: string
  rate?: number
  // outsource
  basis?: OutsourceBasis
  // own labour
  workerName?: string
  dailyRate?: number
  days?: number
  otHours?: number
  // supplier link (material / outsource)
  supplierId?: string
  supplierInvoiceId?: string
}

export type SupplierCategory = 'Material Supplier' | 'Steel Supplier' | 'Outsource Contractor' | 'Electrical Contractor' | 'Equipment Rental'

export interface Supplier {
  id: string // SUP-001
  name: string
  category: SupplierCategory
  contactPerson: string
  phone: string
  email: string
  city: string
}

/** Supplier invoice. Amount is derived from linked expenses (expense = cost, invoice = payable). */
export interface SupplierInvoice {
  id: string // SIN-001
  supplierId: string
  projectId: string
  invoiceNumber: string // supplier's own number
  invoiceDate: ISODate
  dueDate: ISODate
}

export type PaymentMethod = 'Bank Transfer' | 'Cash' | 'Cheque' | 'Other'
export const PAYMENT_METHODS: PaymentMethod[] = ['Bank Transfer', 'Cash', 'Cheque', 'Other']

export interface SupplierPayment {
  id: string // SPAY-001
  supplierInvoiceId: string
  date: ISODate
  amount: number
  method: PaymentMethod
  reference: string
}

export interface ClientInvoice {
  id: string // CINV-001
  invoiceNumber: string // INV-2026-001
  projectId: string
  phaseId: string
  description: string
  invoiceDate: ISODate
  dueDate: ISODate
  amount: number
}

export interface ClientPayment {
  id: string // PAY-001
  clientInvoiceId: string
  date: ISODate
  amount: number
  method: PaymentMethod
  reference: string
}

export type ChangeOrderStatus = 'Pending Approval' | 'Approved' | 'Rejected'

export interface ChangeOrder {
  id: string // CO-001
  number: string // CO-2026-001
  projectId: string
  description: string
  date: ISODate
  revenue: number
  estimatedCost: number
  status: ChangeOrderStatus
  approvedDate?: ISODate
  phaseId?: string // phase created on approval
}

export type DocumentType =
  | 'Quotation'
  | 'Signed Contract'
  | 'BOQ'
  | 'Supplier Invoice'
  | 'Client Invoice'
  | 'Payment Receipt'
  | 'Project Report'
  | 'Site Photo'

export type DocumentEntity = 'Project' | 'Phase' | 'Quotation' | 'Contract' | 'Invoice' | 'Expense' | 'Supplier'

export interface DocumentRecord {
  id: string // DOC-001
  name: string
  type: DocumentType
  entityType: DocumentEntity
  entityId: string
  projectId?: string
  uploadedAt: ISODate
  uploadedBy: string
  sizeKb: number
}

export interface ProjectClosure {
  id: string // CLS-001
  projectId: string
  closedDate: ISODate
  closedBy: string
  notes?: string
  // snapshot of final figures at closure
  finalRevenue: number
  finalCost: number
  finalProfit: number
  clientPending: number
  supplierPending: number
}

export interface Database {
  clients: Client[]
  projects: Project[]
  quotations: Quotation[]
  quotationItems: QuotationItem[]
  contracts: Contract[]
  phases: Phase[]
  expenses: Expense[]
  suppliers: Supplier[]
  supplierInvoices: SupplierInvoice[]
  supplierPayments: SupplierPayment[]
  clientInvoices: ClientInvoice[]
  clientPayments: ClientPayment[]
  changeOrders: ChangeOrder[]
  documents: DocumentRecord[]
  closures: ProjectClosure[]
}
