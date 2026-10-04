import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Check, Plus, Send, X } from 'lucide-react'
import { ConvertQuoteForm, QuotationForm } from '../components/workflowForms'
import { Button, Callout, Card, EmptyRow, FilterBar, Kpi, KpiGrid, Money, PageHeader, Select, StatusBadge, Table, Td, Th } from '../components/ui'
import type { QuotationStatus } from '../data/types'
import { quotationTotals } from '../lib/calc'
import { formatCompact, formatDate, formatPct, today } from '../lib/format'
import * as A from '../store/actions'
import { useStore } from '../store/store'

const STATUSES: QuotationStatus[] = ['Draft', 'Sent', 'Under Review', 'Approved', 'Rejected', 'Expired']

export function Quotations() {
  const { db } = useStore()
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)
  const [convert, setConvert] = useState<string | null>(null)
  const rows = db.quotations
    .filter((q) => !status || q.status === status)
    .sort((a, b) => b.id.localeCompare(a.id))
    .map((q) => ({ q, t: quotationTotals(db, q.id) }))
  const all = db.quotations.map((q) => ({ q, t: quotationTotals(db, q.id) }))
  const pipeline = all.filter(({ q }) => ['Sent', 'Under Review', 'Draft'].includes(q.status))
  const decided = all.filter(({ q }) => q.status === 'Approved' || q.status === 'Rejected')
  const won = decided.filter(({ q }) => q.status === 'Approved')

  return (
    <>
      <PageHeader title="Quotations" subtitle="Enquiry → quotation → approval → project." actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New quotation</Button>} />
      <KpiGrid cols={4}>
        <Kpi label="Open pipeline" value={formatCompact(pipeline.reduce((a, x) => a + x.t.value, 0))} sub={`${pipeline.length} quotations`} />
        <Kpi label="Approved value" value={formatCompact(won.reduce((a, x) => a + x.t.value, 0))} sub={`${won.length} quotations`} tone="positive" />
        <Kpi label="Win rate" value={formatPct(decided.length ? (won.length / decided.length) * 100 : 0, 0)} sub="approved ÷ decided" />
        <Kpi label="Awaiting conversion" value={all.filter(({ q }) => q.status === 'Approved' && !q.projectId).length} sub="approved, no project yet" tone="warning" />
      </KpiGrid>
      <Card className="mt-5" bodyClassName="">
        <FilterBar>
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
        </FilterBar>
        <Table>
          <thead><tr><Th>Quote no.</Th><Th>Client</Th><Th>Project</Th><Th>Quote date</Th><Th right>Quote value</Th><Th right>Estimated cost</Th><Th right>Expected profit</Th><Th right>Margin</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={10} />}
            {rows.map(({ q, t }) => (
              <tr key={q.id} className="hover:bg-slate-50/60">
                <Td><Link to={`/quotations/${q.id}`} className="font-medium text-navy-900 hover:text-blue-600">{q.id}</Link></Td>
                <Td>{db.clients.find((c) => c.id === q.clientId)?.name}</Td>
                <Td>{q.projectName}</Td>
                <Td className="whitespace-nowrap">{formatDate(q.quoteDate)}</Td>
                <Td right><Money value={t.value} /></Td>
                <Td right><Money value={t.estimatedCost} /></Td>
                <Td right><Money value={t.expectedProfit} className="text-emerald-700" /></Td>
                <Td right>{formatPct(t.margin)}</Td>
                <Td><StatusBadge status={q.status} /></Td>
                <Td>
                  {q.projectId ? <Link to={`/projects/${q.projectId}`} className="whitespace-nowrap text-xs font-medium text-blue-600 hover:underline">{q.projectId} →</Link>
                    : q.status === 'Approved' ? <Button size="sm" variant="success" onClick={() => setConvert(q.id)}>Convert → Project</Button> : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <QuotationForm open={open} onClose={() => setOpen(false)} />
      {convert && <ConvertQuoteForm open onClose={() => setConvert(null)} quotationId={convert} />}
    </>
  )
}

export function QuotationDetail() {
  const { id } = useParams()
  const { db, commit } = useStore()
  const [convert, setConvert] = useState(false)
  const q = db.quotations.find((x) => x.id === id)
  if (!q) return <PageHeader title="Quotation not found" crumbs={[{ label: 'Quotations', to: '/quotations' }]} />
  const t = quotationTotals(db, q.id)
  const client = db.clients.find((c) => c.id === q.clientId)
  const set = (s: QuotationStatus, msg: string) => commit(A.setQuotationStatus(db, q.id, s), msg)
  const expired = q.validUntil < today() && ['Sent', 'Under Review'].includes(q.status)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Quotations', to: '/quotations' }, { label: q.id }]}
        title={<span className="flex items-center gap-3">{q.id}<StatusBadge status={q.status} /></span>}
        subtitle={<>{q.projectName} · <Link to={`/clients/${q.clientId}`} className="hover:text-blue-600">{client?.name}</Link> · {q.location}</>}
        actions={
          <>
            {q.status === 'Draft' && <Button variant="primary" icon={<Send size={14} />} onClick={() => set('Sent', `${q.id} sent to client`)}>Mark as sent</Button>}
            {q.status === 'Sent' && <Button onClick={() => set('Under Review', `${q.id} under client review`)}>Mark under review</Button>}
            {['Sent', 'Under Review'].includes(q.status) && (
              <>
                <Button variant="success" icon={<Check size={14} />} onClick={() => set('Approved', `${q.id} approved by client`)}>Approve</Button>
                <Button icon={<X size={14} />} onClick={() => set('Rejected', `${q.id} marked rejected`)}>Reject</Button>
              </>
            )}
            {q.status === 'Approved' && !q.projectId && <Button variant="primary" icon={<ArrowRight size={14} />} onClick={() => setConvert(true)}>Convert quote → project</Button>}
            {q.projectId && <Link to={`/projects/${q.projectId}`}><Button variant="primary" icon={<ArrowRight size={14} />}>Open project {q.projectId}</Button></Link>}
          </>
        }
      />
      {expired && <div className="mb-5"><Callout tone="warning">Validity ended on {formatDate(q.validUntil)}. <button type="button" className="font-semibold underline" onClick={() => set('Expired', `${q.id} marked expired`)}>Mark as expired</button></Callout></div>}
      {q.notes && <div className="mb-5"><Callout>{q.notes}</Callout></div>}
      <KpiGrid cols={4}>
        <Kpi label="Quote value" value={formatCompact(t.value)} />
        <Kpi label="Estimated cost" value={formatCompact(t.estimatedCost)} />
        <Kpi label="Expected profit" value={formatCompact(t.expectedProfit)} tone="positive" />
        <Kpi label="Expected margin" value={formatPct(t.margin)} tone="positive" sub={`Quoted ${formatDate(q.quoteDate)} · valid till ${formatDate(q.validUntil)}`} />
      </KpiGrid>
      <Card className="mt-5" title="Quotation items" subtitle="Each item becomes a project phase with its estimated cost as the starting budget." bodyClassName="">
        <Table>
          <thead><tr><Th>#</Th><Th>Scope / phase</Th><Th right>Quote value</Th><Th right>Estimated cost</Th><Th right>Expected profit</Th><Th right>Margin</Th></tr></thead>
          <tbody>
            {t.items.map((i, n) => (
              <tr key={i.id}>
                <Td className="text-slate-400">{n + 1}</Td><Td className="font-medium">{i.description}</Td>
                <Td right><Money value={i.amount} /></Td><Td right><Money value={i.estimatedCost} /></Td>
                <Td right><Money value={i.amount - i.estimatedCost} className="text-emerald-700" /></Td>
                <Td right>{formatPct(((i.amount - i.estimatedCost) / i.amount) * 100)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-slate-50 font-semibold"><Td colSpan={2}>Total</Td><Td right><Money value={t.value} /></Td><Td right><Money value={t.estimatedCost} /></Td><Td right><Money value={t.expectedProfit} /></Td><Td right>{formatPct(t.margin)}</Td></tr></tfoot>
        </Table>
      </Card>
      {convert && <ConvertQuoteForm open onClose={() => setConvert(false)} quotationId={q.id} />}
    </>
  )
}
