import type { Database, Phase } from '../data/types'
import {
  clientInvoicePaid, isPhaseDone, phaseBilling, plannedCost, quotationTotals, supplierInvoiceAmount, supplierInvoicePaid,
} from './calc'
import { today } from './format'

// ---------------------------------------------------------------------------
// Data integrity audit. Verifies that every stored fact agrees with the values
// the calculation layer derives from it: references resolve, line amounts
// equal quantity × rate, payments never exceed invoices, contract values equal
// the sum of their phases, statuses match billing, and dates run in order.
// Used by the test suite against the demo seed and after every workflow action.
// ---------------------------------------------------------------------------

export interface AuditIssue {
  level: 'error' | 'warning'
  table: string
  id: string
  message: string
}

const round = (n: number) => Math.round(n * 100) / 100

export function auditDatabase(db: Database): AuditIssue[] {
  const issues: AuditIssue[] = []
  const err = (table: string, id: string, message: string) => issues.push({ level: 'error', table, id, message })
  const warn = (table: string, id: string, message: string) => issues.push({ level: 'warning', table, id, message })
  const asOf = today()

  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
  const clients = byId(db.clients), projects = byId(db.projects), phases = byId(db.phases)
  const suppliers = byId(db.suppliers), sins = byId(db.supplierInvoices), cinvs = byId(db.clientInvoices)
  const quotes = byId(db.quotations), cos = byId(db.changeOrders), contracts = byId(db.contracts)

  // ---- unique ids ----
  for (const [table, list] of Object.entries(db) as [string, { id: string }[]][]) {
    const seen = new Set<string>()
    for (const r of list) { if (seen.has(r.id)) err(table, r.id, 'duplicate id'); seen.add(r.id) }
  }

  // ---- projects, contracts, quotations ----
  for (const p of db.projects) {
    if (!clients.has(p.clientId)) err('projects', p.id, `unknown client ${p.clientId}`)
    const ph = db.phases.filter((x) => x.projectId === p.id)
    const original = ph.filter((x) => !x.changeOrderId).reduce((a, x) => a + x.contractValue, 0)
    if (ph.length && original !== p.contractValue) err('projects', p.id, `contract value ${p.contractValue} ≠ sum of original phases ${original}`)
    if (p.startDate > p.endDate) err('projects', p.id, 'start date after end date')

    const contract = db.contracts.find((c) => c.projectId === p.id)
    if (!contract && p.status !== 'Contract Pending') warn('projects', p.id, 'no contract record')
    if (contract) {
      if (contract.value !== p.contractValue) err('contracts', contract.id, `value ${contract.value} ≠ project contract ${p.contractValue}`)
      if (contract.clientId !== p.clientId) err('contracts', contract.id, 'client differs from project client')
      if (contract.signedDate && contract.signedDate > p.startDate) warn('contracts', contract.id, 'signed after project start')
      const want = p.status === 'Contract Pending' ? ['Pending Signature'] : ['Completed', 'Closed'].includes(p.status) ? ['Completed'] : ['Active', 'Signed']
      if (!want.includes(contract.status)) err('contracts', contract.id, `status ${contract.status} inconsistent with project ${p.status}`)
    }

    if (p.quotationId) {
      const q = quotes.get(p.quotationId)
      if (!q) err('projects', p.id, `unknown quotation ${p.quotationId}`)
      else {
        if (q.projectId !== p.id) err('quotations', q.id, 'project link is not reciprocal')
        if (q.status !== 'Approved') err('quotations', q.id, `converted but status is ${q.status}`)
        const t = quotationTotals(db, q.id)
        if (t.value !== p.contractValue) err('quotations', q.id, `quote value ${t.value} ≠ project contract ${p.contractValue}`)
        if (contract?.signedDate && q.quoteDate > contract.signedDate) err('quotations', q.id, 'quoted after contract was signed')
        // each quote line seeded a phase: its estimated cost is that phase's starting budget
        const original = ph.filter((x) => !x.changeOrderId).sort((a, b) => a.sequence - b.sequence)
        t.items.forEach((it, i) => {
          const phase = original[i]
          if (!phase) return err('quotations', q.id, `item "${it.description}" has no matching phase`)
          if (phase.contractValue !== it.amount) err('quotationItems', it.id, `amount ${it.amount} ≠ phase ${phase.id} value ${phase.contractValue}`)
          if (plannedCost(phase).total !== it.estimatedCost) warn('quotationItems', it.id, `estimated cost ${it.estimatedCost} ≠ phase ${phase.id} budget ${plannedCost(phase).total}`)
        })
      }
    }

    // project status vs phases
    const allDone = ph.length > 0 && ph.every(isPhaseDone)
    if (p.status === 'Active' && allDone) err('projects', p.id, 'Active but every phase is complete — should be Completed')
    if (p.status === 'Completed' && !allDone) err('projects', p.id, 'Completed but some phases are unfinished')
    if (p.status === 'Closed' && !db.closures.some((c) => c.projectId === p.id)) err('projects', p.id, 'Closed without a closure record')
  }
  for (const q of db.quotations) {
    if (!clients.has(q.clientId)) err('quotations', q.id, `unknown client ${q.clientId}`)
    if (q.projectId && !projects.has(q.projectId)) err('quotations', q.id, `unknown project ${q.projectId}`)
    if (q.quoteDate > q.validUntil) err('quotations', q.id, 'valid-until before quote date')
    if (!db.quotationItems.some((i) => i.quotationId === q.id)) err('quotations', q.id, 'no line items')
  }
  for (const i of db.quotationItems) {
    if (!quotes.has(i.quotationId)) err('quotationItems', i.id, `unknown quotation ${i.quotationId}`)
    if (i.amount <= 0 || i.estimatedCost < 0) err('quotationItems', i.id, 'non-positive amount')
  }

  // ---- phases ----
  for (const ph of db.phases) {
    if (!projects.has(ph.projectId)) err('phases', ph.id, `unknown project ${ph.projectId}`)
    if (Object.values(ph.budget).some((v) => v < 0)) err('phases', ph.id, 'negative budget')
    const { billed, received } = phaseBilling(db, ph.id)
    const hasCost = db.expenses.some((e) => e.phaseId === ph.id)
    if (billed > ph.contractValue) err('phases', ph.id, `billed ${billed} exceeds phase value ${ph.contractValue}`)
    checkPhaseStatus(ph, billed, received, hasCost, err)
    if (ph.startDate && ph.endDate && ph.startDate > ph.endDate) err('phases', ph.id, 'start date after end date')
  }

  // ---- change orders ----
  for (const c of db.changeOrders) {
    if (!projects.has(c.projectId)) err('changeOrders', c.id, `unknown project ${c.projectId}`)
    if (c.status === 'Approved') {
      const ph = c.phaseId ? phases.get(c.phaseId) : undefined
      if (!ph) { err('changeOrders', c.id, 'approved without a tracking phase'); continue }
      if (ph.changeOrderId !== c.id) err('changeOrders', c.id, `phase ${ph.id} does not point back to this change order`)
      if (ph.contractValue !== c.revenue) err('changeOrders', c.id, `revenue ${c.revenue} ≠ phase value ${ph.contractValue}`)
      if (plannedCost(ph).total !== c.estimatedCost) warn('changeOrders', c.id, `estimated cost ${c.estimatedCost} ≠ phase budget ${plannedCost(ph).total}`)
      if (c.approvedDate && c.approvedDate < c.date) err('changeOrders', c.id, 'approved before it was raised')
      if (c.approvedDate && ph.startDate && ph.startDate < c.approvedDate) warn('changeOrders', c.id, 'work started before approval')
    } else if (c.phaseId) err('changeOrders', c.id, `${c.status} change order has a phase`)
  }
  for (const ph of db.phases) if (ph.changeOrderId && cos.get(ph.changeOrderId)?.phaseId !== ph.id) err('phases', ph.id, 'change-order link is not reciprocal')

  // ---- expenses ----
  for (const e of db.expenses) {
    const ph = phases.get(e.phaseId)
    if (!ph) { err('expenses', e.id, `unknown phase ${e.phaseId}`); continue }
    if (ph.projectId !== e.projectId) err('expenses', e.id, `phase ${ph.id} belongs to ${ph.projectId}, not ${e.projectId}`)
    if (e.amount <= 0) err('expenses', e.id, 'non-positive amount')
    if (e.category === 'labour' && round((e.dailyRate ?? 0) * (e.days ?? 0)) !== round(e.amount)) err('expenses', e.id, `labour ${e.dailyRate} × ${e.days} ≠ ${e.amount}`)
    if ((e.category === 'material' || (e.category === 'outsource' && e.basis === 'rate')) && round((e.quantity ?? 0) * (e.rate ?? 0)) !== round(e.amount)) err('expenses', e.id, `${e.quantity} × ${e.rate} ≠ ${e.amount}`)
    if (e.category === 'outsource' && e.basis === 'fixed' && e.rate !== e.amount) err('expenses', e.id, 'fixed outsource rate ≠ amount')
    if ((e.category === 'material' || e.category === 'outsource') && !e.supplierInvoiceId) err('expenses', e.id, 'supplier cost without a supplier invoice')
    if (e.supplierId && !suppliers.has(e.supplierId)) err('expenses', e.id, `unknown supplier ${e.supplierId}`)
    if (e.supplierInvoiceId) {
      const s = sins.get(e.supplierInvoiceId)
      if (!s) err('expenses', e.id, `unknown supplier invoice ${e.supplierInvoiceId}`)
      else {
        if (s.supplierId !== e.supplierId) err('expenses', e.id, `supplier differs from invoice ${s.id}`)
        if (s.projectId !== e.projectId) err('expenses', e.id, `project differs from invoice ${s.id}`)
        if (s.invoiceDate !== e.date) warn('expenses', e.id, `dated ${e.date} but invoice ${s.id} is ${s.invoiceDate}`)
      }
    }
    if (e.date > asOf) err('expenses', e.id, `dated after as-of date ${asOf}`)
    if (ph.startDate && e.date < ph.startDate) warn('expenses', e.id, `dated before phase start ${ph.startDate}`)
    if (ph.endDate && isPhaseDone(ph) && e.date > ph.endDate) warn('expenses', e.id, `dated after phase end ${ph.endDate}`)
  }

  // ---- supplier invoices & payments ----
  for (const s of db.supplierInvoices) {
    if (!suppliers.has(s.supplierId)) err('supplierInvoices', s.id, `unknown supplier ${s.supplierId}`)
    const amount = supplierInvoiceAmount(db, s.id), paid = supplierInvoicePaid(db, s.id)
    if (amount <= 0) err('supplierInvoices', s.id, 'no expense lines')
    if (paid > amount) err('supplierInvoices', s.id, `paid ${paid} exceeds invoice ${amount}`)
    if (s.dueDate < s.invoiceDate) err('supplierInvoices', s.id, 'due before invoice date')
  }
  for (const p of db.supplierPayments) {
    const s = sins.get(p.supplierInvoiceId)
    if (!s) { err('supplierPayments', p.id, `unknown invoice ${p.supplierInvoiceId}`); continue }
    if (p.amount <= 0) err('supplierPayments', p.id, 'non-positive amount')
    if (p.date < s.invoiceDate) err('supplierPayments', p.id, 'paid before the invoice date')
    if (p.date > asOf) err('supplierPayments', p.id, `dated after as-of date ${asOf}`)
  }

  // ---- client invoices & payments ----
  for (const i of db.clientInvoices) {
    const ph = phases.get(i.phaseId)
    if (!ph) { err('clientInvoices', i.id, `unknown phase ${i.phaseId}`); continue }
    if (ph.projectId !== i.projectId) err('clientInvoices', i.id, `phase ${ph.id} belongs to another project`)
    if (i.amount <= 0) err('clientInvoices', i.id, 'non-positive amount')
    if (clientInvoicePaid(db, i.id) > i.amount) err('clientInvoices', i.id, 'payments exceed invoice amount')
    if (i.dueDate < i.invoiceDate) err('clientInvoices', i.id, 'due before invoice date')
    if (i.invoiceDate > asOf) err('clientInvoices', i.id, `dated after as-of date ${asOf}`)
    if (ph.startDate && i.invoiceDate < ph.startDate) warn('clientInvoices', i.id, 'invoiced before the phase started')
    if (/final/i.test(i.description) && ph.endDate && i.invoiceDate < ph.endDate) warn('clientInvoices', i.id, 'final bill raised before the phase ended')
  }
  for (const p of db.clientPayments) {
    const i = cinvs.get(p.clientInvoiceId)
    if (!i) { err('clientPayments', p.id, `unknown invoice ${p.clientInvoiceId}`); continue }
    if (p.amount <= 0) err('clientPayments', p.id, 'non-positive amount')
    if (p.date < i.invoiceDate) err('clientPayments', p.id, 'received before the invoice date')
    if (p.date > asOf) err('clientPayments', p.id, `dated after as-of date ${asOf}`)
  }

  // ---- documents ----
  const entityExists: Record<string, (id: string) => boolean> = {
    Project: (id) => projects.has(id), Phase: (id) => phases.has(id), Quotation: (id) => quotes.has(id),
    Contract: (id) => contracts.has(id), Invoice: (id) => cinvs.has(id), Supplier: (id) => suppliers.has(id),
    Expense: (id) => db.expenses.some((e) => e.id === id),
  }
  for (const d of db.documents) {
    if (!entityExists[d.entityType]?.(d.entityId)) err('documents', d.id, `linked ${d.entityType} ${d.entityId} does not exist`)
    if (d.projectId && !projects.has(d.projectId)) err('documents', d.id, `unknown project ${d.projectId}`)
  }
  for (const c of db.contracts) {
    if (c.documentId && !db.documents.some((d) => d.id === c.documentId)) err('contracts', c.id, `document ${c.documentId} missing`)
    if (c.status === 'Active' && !c.documentId) err('contracts', c.id, 'active without a signed document')
  }

  return issues
}

function checkPhaseStatus(ph: Phase, billed: number, received: number, hasCost: boolean, err: (t: string, id: string, m: string) => void) {
  const full = billed >= ph.contractValue
  const paid = received >= ph.contractValue
  switch (ph.status) {
    case 'Planned':
      if (ph.progress !== 0) err('phases', ph.id, 'Planned with progress > 0')
      if (hasCost) err('phases', ph.id, 'Planned but already has costs — should be In Progress')
      break
    case 'In Progress':
      if (ph.progress >= 100) err('phases', ph.id, 'In Progress at 100% — should be Completed')
      break
    case 'Completed':
      if (full) err('phases', ph.id, 'fully billed — should be Billed')
      break
    case 'Billed':
      if (!full) err('phases', ph.id, 'Billed but not fully invoiced')
      if (paid) err('phases', ph.id, 'fully received — should be Payment Received')
      break
    case 'Payment Received':
      if (!paid) err('phases', ph.id, 'Payment Received but balance outstanding')
      break
  }
  if (['Completed', 'Billed', 'Payment Received', 'Closed'].includes(ph.status) && ph.progress !== 100) err('phases', ph.id, `${ph.status} with progress ${ph.progress}%`)
}
