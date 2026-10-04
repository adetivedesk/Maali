import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { ClientInvoice, Expense, Phase } from '../data/types'
import { PHASE_STATUSES } from '../data/types'
import {
  COST_CATEGORIES, COST_LABEL, clientInvoicePaid, clientInvoiceStatus, type CostBreakdown, type SupplierInvoiceView,
} from '../lib/calc'
import { formatDate, formatINR, formatPct } from '../lib/format'
import * as A from '../store/actions'
import { useLookups, useStore } from '../store/store'
import { Button, EmptyRow, Money, Pill, StatusBadge, Table, Td, Th, Variance } from './ui'

const CATEGORY_TONE = { material: 'blue', labour: 'amber', outsource: 'green', other: 'slate' } as const

export function ExpenseTable({ expenses, showProject = true, showPhase = true, allowDelete = true }: { expenses: Expense[]; showProject?: boolean; showPhase?: boolean; allowDelete?: boolean }) {
  const { db, commit } = useStore()
  const L = useLookups()
  const total = expenses.reduce((a, e) => a + e.amount, 0)
  const cols = 7 + (showProject ? 1 : 0) + (showPhase ? 1 : 0)
  return (
    <Table>
      <thead>
        <tr>
          <Th>ID</Th><Th>Date</Th>{showProject && <Th>Project</Th>}{showPhase && <Th>Phase</Th>}<Th>Category</Th><Th>Item</Th><Th>Calculation</Th><Th>Supplier / Invoice</Th><Th right>Amount</Th>
        </tr>
      </thead>
      <tbody>
        {expenses.length === 0 && <EmptyRow cols={cols}>No expenses recorded</EmptyRow>}
        {expenses.map((e) => {
          const sin = db.supplierInvoices.find((s) => s.id === e.supplierInvoiceId)
          return (
            <tr key={e.id} className="group hover:bg-slate-50/60">
              <Td className="font-mono text-xs text-slate-500">{e.id}</Td>
              <Td className="whitespace-nowrap text-slate-600">{formatDate(e.date)}</Td>
              {showProject && <Td><Link to={`/projects/${e.projectId}`} className="text-slate-700 hover:text-blue-600">{L.project(e.projectId)?.shortName}</Link></Td>}
              {showPhase && <Td><Link to={`/phases/${e.phaseId}`} className="text-slate-700 hover:text-blue-600">{L.phase(e.phaseId)?.name}</Link></Td>}
              <Td><Pill tone={CATEGORY_TONE[e.category]}>{COST_LABEL[e.category]}</Pill></Td>
              <Td><div className="font-medium text-slate-800">{e.subType}</div><div className="max-w-60 truncate text-xs text-slate-500">{e.category === 'labour' ? e.workerName : e.description}</div></Td>
              <Td className="num whitespace-nowrap text-xs text-slate-600">
                {e.category === 'labour' ? `${formatINR(e.dailyRate ?? 0)}/day × ${e.days} days`
                  : e.basis === 'fixed' ? 'Fixed contract'
                    : e.quantity !== undefined ? `${e.quantity.toLocaleString('en-IN')} ${e.unit} × ${formatINR(e.rate ?? 0)}` : 'Direct'}
              </Td>
              <Td>
                {e.supplierId ? (
                  <>
                    <Link to={`/suppliers/${e.supplierId}`} className="text-slate-700 hover:text-blue-600">{L.supplier(e.supplierId)?.name}</Link>
                    <div className="text-xs text-slate-400">{sin?.invoiceNumber}</div>
                  </>
                ) : <span className="text-xs text-slate-400">Paid at site</span>}
              </Td>
              <Td right className="font-medium">
                <div className="flex items-center justify-end gap-2">
                  <Money value={e.amount} />
                  {allowDelete && (
                    <button type="button" title="Delete expense" onClick={() => commit(A.deleteExpense(db, e.id), `${e.id} deleted`)} className="rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </Td>
            </tr>
          )
        })}
      </tbody>
      {expenses.length > 0 && (
        <tfoot><tr className="bg-slate-50 font-semibold text-navy-900"><Td colSpan={cols - 1}>Total · {expenses.length} entries</Td><Td right><Money value={total} /></Td></tr></tfoot>
      )}
    </Table>
  )
}

export function ClientInvoiceTable({ invoices, onPay, showProject = true }: { invoices: ClientInvoice[]; onPay?: (invoiceId: string) => void; showProject?: boolean }) {
  const { db } = useStore()
  const L = useLookups()
  const [open, setOpen] = useState<string | null>(null)
  const totals = invoices.reduce((a, i) => { const p = clientInvoicePaid(db, i.id); return { amount: a.amount + i.amount, paid: a.paid + p } }, { amount: 0, paid: 0 })
  const cols = 9 + (showProject ? 1 : 0)
  return (
    <Table>
      <thead>
        <tr><Th className="w-8" /><Th>Invoice</Th>{showProject && <Th>Project</Th>}<Th>Phase / description</Th><Th>Invoice date</Th><Th>Due</Th><Th right>Amount</Th><Th right>Received</Th><Th right>Pending</Th><Th>Status</Th>{onPay && <Th />}</tr>
      </thead>
      <tbody>
        {invoices.length === 0 && <EmptyRow cols={cols}>No invoices</EmptyRow>}
        {invoices.map((i) => {
          const paid = clientInvoicePaid(db, i.id)
          const status = clientInvoiceStatus(db, i)
          const payments = db.clientPayments.filter((p) => p.clientInvoiceId === i.id)
          const isOpen = open === i.id
          return (
            <Fragment key={i.id}>
              <tr className="hover:bg-slate-50/60">
                <Td><button type="button" onClick={() => setOpen(isOpen ? null : i.id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></Td>
                <Td className="whitespace-nowrap font-medium text-navy-900">{i.invoiceNumber}<div className="font-mono text-[11px] font-normal text-slate-400">{i.id}</div></Td>
                {showProject && <Td><Link to={`/projects/${i.projectId}`} className="hover:text-blue-600">{L.project(i.projectId)?.shortName}</Link></Td>}
                <Td><Link to={`/phases/${i.phaseId}`} className="text-slate-700 hover:text-blue-600">{L.phase(i.phaseId)?.name}</Link><div className="text-xs text-slate-400">{i.description}</div></Td>
                <Td className="whitespace-nowrap">{formatDate(i.invoiceDate)}</Td>
                <Td className={clsx('whitespace-nowrap', status === 'Overdue' && 'font-medium text-red-600')}>{formatDate(i.dueDate)}</Td>
                <Td right><Money value={i.amount} /></Td>
                <Td right><Money value={paid} className="text-emerald-700" /></Td>
                <Td right><Money value={i.amount - paid} className={i.amount - paid > 0 ? 'font-medium text-red-600' : 'text-slate-400'} /></Td>
                <Td><StatusBadge status={status} /></Td>
                {onPay && <Td>{i.amount - paid > 0 && <Button size="sm" onClick={() => onPay(i.id)}>Record payment</Button>}</Td>}
              </tr>
              {isOpen && (
                <tr className="bg-slate-50/70">
                  <td colSpan={cols + (onPay ? 1 : 0)} className="px-5 py-3 sm:px-14">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment history</div>
                    {payments.length === 0 ? <div className="text-sm text-slate-400">No payments yet</div> : (
                      <table className="text-sm">
                        <thead><tr className="text-left text-xs text-slate-500"><th className="pr-8 font-medium">Payment</th><th className="pr-8 font-medium">Date</th><th className="pr-8 font-medium">Reference</th><th className="pr-8 font-medium">Method</th><th className="text-right font-medium">Amount</th></tr></thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id}><td className="pr-8 font-mono text-xs">{p.id}</td><td className="pr-8">{formatDate(p.date)}</td><td className="pr-8 text-slate-600">{p.reference}</td><td className="pr-8">{p.method}</td><td className="num text-right">{formatINR(p.amount)}</td></tr>
                          ))}
                          <tr className="border-t border-slate-200 font-semibold"><td colSpan={4} className="pt-1">Balance</td><td className="num pt-1 text-right">{formatINR(i.amount - paid)}</td></tr>
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
      {invoices.length > 0 && (
        <tfoot>
          <tr className="bg-slate-50 font-semibold text-navy-900">
            <Td colSpan={showProject ? 6 : 5}>Total · {invoices.length} invoices</Td>
            <Td right><Money value={totals.amount} /></Td><Td right><Money value={totals.paid} /></Td><Td right><Money value={totals.amount - totals.paid} /></Td>
            <Td colSpan={onPay ? 2 : 1} />
          </tr>
        </tfoot>
      )}
    </Table>
  )
}

export function SupplierInvoiceTable({ views, onPay, showSupplier = true, showProject = true }: { views: SupplierInvoiceView[]; onPay?: (id: string) => void; showSupplier?: boolean; showProject?: boolean }) {
  const { db } = useStore()
  const L = useLookups()
  const [open, setOpen] = useState<string | null>(null)
  const t = views.reduce((a, v) => ({ amount: a.amount + v.amount, paid: a.paid + v.paid }), { amount: 0, paid: 0 })
  const cols = 8 + (showSupplier ? 1 : 0) + (showProject ? 1 : 0) + (onPay ? 1 : 0)
  return (
    <Table>
      <thead>
        <tr><Th className="w-8" />{showSupplier && <Th>Supplier</Th>}<Th>Invoice no.</Th>{showProject && <Th>Project / phase</Th>}<Th>Invoice date</Th><Th>Due</Th><Th right>Invoice amount</Th><Th right>Paid</Th><Th right>Pending</Th><Th>Status</Th>{onPay && <Th />}</tr>
      </thead>
      <tbody>
        {views.length === 0 && <EmptyRow cols={cols}>No supplier invoices</EmptyRow>}
        {views.map((v) => {
          const isOpen = open === v.id
          const lines = db.expenses.filter((e) => e.supplierInvoiceId === v.id)
          const pays = db.supplierPayments.filter((p) => p.supplierInvoiceId === v.id)
          return (
            <Fragment key={v.id}>
              <tr className="hover:bg-slate-50/60">
                <Td><button type="button" onClick={() => setOpen(isOpen ? null : v.id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></Td>
                {showSupplier && <Td><Link to={`/suppliers/${v.supplierId}`} className="font-medium text-navy-900 hover:text-blue-600">{L.supplier(v.supplierId)?.name}</Link></Td>}
                <Td className="whitespace-nowrap">{v.invoiceNumber}<div className="font-mono text-[11px] text-slate-400">{v.id}</div></Td>
                {showProject && <Td><div>{L.project(v.projectId)?.shortName}</div><div className="text-xs text-slate-400">{v.phaseIds.map((id) => L.phase(id)?.name).join(', ')}</div></Td>}
                <Td className="whitespace-nowrap">{formatDate(v.invoiceDate)}</Td>
                <Td className={clsx('whitespace-nowrap', v.status === 'Overdue' && 'font-medium text-red-600')}>{formatDate(v.dueDate)}</Td>
                <Td right><Money value={v.amount} /></Td>
                <Td right><Money value={v.paid} className="text-emerald-700" /></Td>
                <Td right><Money value={v.pending} className={v.pending > 0 ? 'font-medium text-red-600' : 'text-slate-400'} /></Td>
                <Td><StatusBadge status={v.status} /></Td>
                {onPay && <Td>{v.pending > 0 && <Button size="sm" onClick={() => onPay(v.id)}>Pay</Button>}</Td>}
              </tr>
              {isOpen && (
                <tr className="bg-slate-50/70">
                  <td colSpan={cols} className="px-5 py-3 sm:px-14">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invoice lines (expenses)</div>
                        {lines.map((e) => (
                          <div key={e.id} className="flex justify-between gap-4 py-0.5 text-sm"><span><span className="font-mono text-xs text-slate-400">{e.id}</span> {e.subType} — {e.description}</span><span className="num">{formatINR(e.amount)}</span></div>
                        ))}
                      </div>
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payments</div>
                        {pays.length === 0 && <div className="text-sm text-slate-400">No payments yet</div>}
                        {pays.map((p) => (
                          <div key={p.id} className="flex justify-between gap-4 py-0.5 text-sm"><span><span className="font-mono text-xs text-slate-400">{p.id}</span> {formatDate(p.date)} · {p.method} · {p.reference}</span><span className="num">{formatINR(p.amount)}</span></div>
                        ))}
                        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-sm font-semibold"><span>Pending</span><span className="num">{formatINR(v.pending)}</span></div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
      {views.length > 0 && (
        <tfoot>
          <tr className="bg-slate-50 font-semibold text-navy-900">
            <Td colSpan={4 + (showSupplier ? 1 : 0) + (showProject ? 1 : 0)}>Total · {views.length} invoices</Td>
            <Td right><Money value={t.amount} /></Td><Td right><Money value={t.paid} /></Td><Td right><Money value={t.amount - t.paid} /></Td>
            <Td colSpan={onPay ? 2 : 1} />
          </tr>
        </tfoot>
      )}
    </Table>
  )
}

export function PlannedVsActualTable({ planned, actual, completion }: { planned: CostBreakdown; actual: CostBreakdown; completion?: number }) {
  const rows = [...COST_CATEGORIES.map((k) => ({ label: COST_LABEL[k], p: planned[k], a: actual[k] })), { label: 'Total', p: planned.total, a: actual.total }]
  return (
    <Table>
      <thead><tr><Th>Cost type</Th><Th right>Planned</Th><Th right>Actual</Th><Th right>Variance</Th><Th>Budget used</Th></tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const used = r.p ? (r.a / r.p) * 100 : r.a ? 100 : 0
          const isTotal = i === rows.length - 1
          return (
            <tr key={r.label} className={isTotal ? 'bg-slate-50 font-semibold text-navy-900' : ''}>
              <Td>{r.label}</Td>
              <Td right><Money value={r.p} /></Td>
              <Td right><Money value={r.a} /></Td>
              <Td right><Variance value={r.a - r.p} /></Td>
              <Td className="w-44">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={clsx('h-full rounded-full', used > 100 ? 'bg-red-600' : used > 90 ? 'bg-amber-500' : 'bg-blue-600')} style={{ width: `${Math.min(used, 100)}%` }} />
                  </div>
                  <span className={clsx('num w-12 text-right text-xs', used > 100 ? 'font-semibold text-red-600' : 'text-slate-600')}>{formatPct(used, 0)}</span>
                </div>
              </Td>
            </tr>
          )
        })}
      </tbody>
      {completion !== undefined && completion < 100 && (
        <tfoot><tr><td colSpan={5} className="px-5 py-2 text-xs text-slate-500">Work is {formatPct(completion, 0)} complete — compare budget used % with completion % to spot overruns early.</td></tr></tfoot>
      )}
    </Table>
  )
}

export function PhaseStatusSelect({ phase, disabled }: { phase: Phase; disabled?: boolean }) {
  const { db, commit } = useStore()
  return (
    <select
      value={phase.status}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => commit(A.setPhaseStatus(db, phase.id, e.target.value as Phase['status']), `${phase.name} → ${e.target.value}`)}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 disabled:opacity-60"
    >
      {PHASE_STATUSES.map((s) => <option key={s}>{s}</option>)}
    </select>
  )
}
