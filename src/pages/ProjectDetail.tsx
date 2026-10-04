import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Check, FileCheck2, Lock, Pause, Pencil, Play, Plus, Receipt, Upload } from 'lucide-react'
import { BarsChart, SERIES } from '../components/charts'
import { ClientInvoiceForm, ClientPaymentForm, ExpenseForm, SupplierPaymentForm } from '../components/forms'
import { ClientInvoiceTable, ExpenseTable, PhaseStatusSelect, PlannedVsActualTable, SupplierInvoiceTable } from '../components/tables'
import {
  Button, Callout, Card, EmptyRow, Kpi, KpiGrid, Money, PageHeader, Progress, Stat, StatusBadge, Table, Tabs, Td, Th, Variance,
} from '../components/ui'
import { ChangeOrderForm, CloseProjectDialog, ContractUploadForm, DocumentUploadForm, PhaseForm } from '../components/workflowForms'
import { canCloseProject, phaseFinancials, projectFinancials, supplierInvoiceView, type ProjectFinancials } from '../lib/calc'
import { formatCompact, formatDate, formatINR, formatPct } from '../lib/format'
import * as A from '../store/actions'
import { useStore } from '../store/store'
import { DocumentTable } from './Documents'

type Tab = 'overview' | 'phases' | 'expenses' | 'billing' | 'suppliers' | 'changes' | 'documents'

export function ProjectDetail() {
  const { id } = useParams()
  const { db, commit } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'overview'
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  const [modal, setModal] = useState<null | 'expense' | 'invoice' | 'payment' | 'supplierPay' | 'co' | 'phase' | 'contract' | 'close' | 'doc'>(null)
  const [budgetPhase, setBudgetPhase] = useState<string | undefined>()
  const [payInvoice, setPayInvoice] = useState<string | undefined>()
  const [paySupplierInv, setPaySupplierInv] = useState<string | undefined>()
  const close = () => { setModal(null); setBudgetPhase(undefined); setPayInvoice(undefined); setPaySupplierInv(undefined) }

  const project = db.projects.find((p) => p.id === id)
  if (!project) return <PageHeader title="Project not found" crumbs={[{ label: 'Projects', to: '/projects' }]} />
  const f = projectFinancials(db, project.id)
  const client = db.clients.find((c) => c.id === project.clientId)
  const contract = db.contracts.find((c) => c.projectId === project.id)
  const closable = canCloseProject(db, project.id)
  const isClosed = project.status === 'Closed'
  const allDone = f.phases.length > 0 && f.phases.every((p) => ['Completed', 'Billed', 'Payment Received', 'Closed'].includes(p.status))
  const expenses = db.expenses.filter((e) => e.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date))
  const invoices = db.clientInvoices.filter((i) => i.projectId === project.id)
  const supInvoices = db.supplierInvoices.filter((i) => i.projectId === project.id).map((i) => supplierInvoiceView(db, i))
  const cos = db.changeOrders.filter((c) => c.projectId === project.id)
  const docs = db.documents.filter((d) => d.projectId === project.id)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Projects', to: '/projects' }, { label: project.id }]}
        title={<span className="flex items-center gap-3">{project.name}<StatusBadge status={project.status} /></span>}
        subtitle={<>{client && <Link to={`/clients/${client.id}`} className="hover:text-blue-600">{client.name}</Link>} · {project.location} · {project.projectManager} · {formatDate(project.startDate)} → {formatDate(project.endDate)}</>}
        actions={
          isClosed ? <Link to={`/reports/closure/${project.id}`}><Button variant="primary" icon={<FileCheck2 size={15} />}>View closure report</Button></Link> : (
            <>
              {project.status === 'Active' && <Button icon={<Pause size={14} />} onClick={() => commit(A.setProjectStatus(db, project.id, 'On Hold'), 'Project put on hold')}>Hold</Button>}
              {project.status === 'On Hold' && <Button icon={<Play size={14} />} onClick={() => commit(A.setProjectStatus(db, project.id, 'Active'), 'Project resumed')}>Resume</Button>}
              <Button icon={<Plus size={15} />} onClick={() => setModal('expense')} disabled={project.status === 'Contract Pending'}>Add expense</Button>
              <Button icon={<Receipt size={15} />} onClick={() => setModal('invoice')} disabled={project.status === 'Contract Pending'}>Generate invoice</Button>
              <Button onClick={() => setModal('payment')} disabled={!invoices.length}>Record client payment</Button>
              <Button onClick={() => setModal('co')} disabled={project.status === 'Contract Pending'}>Change order</Button>
              {allDone && <Button variant="primary" icon={<Lock size={14} />} onClick={() => setModal('close')}>Close project</Button>}
            </>
          )
        }
      />

      <WorkflowStrip f={f} contractStatus={contract?.status} />

      {project.status === 'Contract Pending' && contract && (
        <div className="mb-5">
          <Callout tone="warning">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Contract <b>{contract.id}</b> is awaiting signature. Upload the signed contract to activate this project, then set phase budgets and start work.</span>
              <Button variant="primary" size="sm" icon={<Upload size={13} />} onClick={() => setModal('contract')}>Upload signed contract</Button>
            </div>
          </Callout>
        </div>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'phases', label: 'Phases', count: f.phases.length },
          { id: 'expenses', label: 'Expenses', count: expenses.length },
          { id: 'billing', label: 'Client billing', count: invoices.length },
          { id: 'suppliers', label: 'Supplier payables', count: supInvoices.length },
          { id: 'changes', label: 'Change orders', count: cos.length },
          { id: 'documents', label: 'Documents', count: docs.length },
        ]}
      />

      {tab === 'overview' && (
        <>
          <KpiGrid cols={5}>
            <Kpi label="Contract value" value={formatCompact(f.revenue)} sub={f.changeOrderRevenue ? `${formatCompact(f.originalContract)} + ${formatCompact(f.changeOrderRevenue)} CO` : 'original contract'} />
            <Kpi label="Total billed" value={formatCompact(f.billed)} sub={`${formatCompact(f.unbilled)} unbilled`} />
            <Kpi label="Total received" value={formatCompact(f.received)} tone="positive" />
            <Kpi label="Client pending" value={formatCompact(f.clientPending)} tone={f.clientPending ? 'negative' : 'neutral'} sub={f.clientOverdue ? `${formatCompact(f.clientOverdue)} overdue` : 'nothing overdue'} />
            <Kpi label="Completion" value={formatPct(f.completion, 0)} sub={<Progress value={f.completion} className="mt-1" />} />
            <Kpi label="Planned cost" value={formatCompact(f.planned.total)} />
            <Kpi label="Actual cost" value={formatCompact(f.actual.total)} sub={`${formatPct(f.planned.total ? (f.actual.total / f.planned.total) * 100 : 0, 0)} of budget used`} />
            <Kpi label="Expected profit" value={formatCompact(f.expectedProfit)} sub={`${formatPct(f.expectedMargin)} margin`} />
            <Kpi label="Actual profit" value={formatCompact(f.actualProfit)} tone={f.actualProfit >= 0 ? 'positive' : 'negative'} sub={`${formatPct(f.actualMargin)} on earned revenue`} />
            <Kpi label="Supplier pending" value={formatCompact(f.supplierPending)} tone={f.supplierPending ? 'warning' : 'neutral'} sub={f.supplierOverdue ? `${formatCompact(f.supplierOverdue)} overdue` : undefined} />
          </KpiGrid>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <ProfitabilityCard f={f} />
            <CashPositionCard f={f} />
          </div>

          <div className="mt-5">
            <PhaseTable projectId={project.id} readOnly={isClosed} onBudget={(phId) => { setBudgetPhase(phId); setModal('phase') }} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card title="Planned vs Actual — by cost type" bodyClassName=""><PlannedVsActualTable planned={f.planned} actual={f.actual} completion={f.completion} /></Card>
            <Card title="Planned vs Actual — by phase">
              <BarsChart
                height={250}
                data={f.phases.map((p) => { const pf = phaseFinancials(db, p); return { name: p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name, planned: pf.planned.total, actual: pf.actual.total } })}
                xKey="name"
                series={[{ key: 'planned', label: 'Planned', color: SERIES.blue }, { key: 'actual', label: 'Actual', color: SERIES.orange }]}
              />
            </Card>
          </div>
        </>
      )}

      {tab === 'phases' && (
        <PhaseTable projectId={project.id} readOnly={isClosed} onBudget={(phId) => { setBudgetPhase(phId); setModal('phase') }} onAdd={isClosed ? undefined : () => setModal('phase')} />
      )}

      {tab === 'expenses' && (
        <Card title="Project expenses" subtitle={`${formatINR(f.actual.total)} booked · material ${formatCompact(f.actual.material)} · own labour ${formatCompact(f.actual.labour)} · outsource ${formatCompact(f.actual.outsource)} · other ${formatCompact(f.actual.other)}`} bodyClassName=""
          actions={!isClosed && <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setModal('expense')}>Add expense</Button>}>
          <ExpenseTable expenses={expenses} showProject={false} allowDelete={!isClosed} />
        </Card>
      )}

      {tab === 'billing' && (
        <div className="space-y-5">
          <KpiGrid cols={4}>
            <Kpi label="Total revenue" value={formatCompact(f.revenue)} />
            <Kpi label="Billed" value={formatCompact(f.billed)} />
            <Kpi label="Received" value={formatCompact(f.received)} tone="positive" />
            <Kpi label="Receivable" value={formatCompact(f.clientPending)} tone="negative" />
          </KpiGrid>
          <Card title="Client invoices" bodyClassName="" actions={!isClosed && <Button variant="primary" size="sm" icon={<Receipt size={13} />} onClick={() => setModal('invoice')}>Generate invoice</Button>}>
            <ClientInvoiceTable invoices={invoices} showProject={false} onPay={isClosed ? undefined : (iid) => { setPayInvoice(iid); setModal('payment') }} />
          </Card>
        </div>
      )}

      {tab === 'suppliers' && (
        <Card title="Supplier invoices for this project" subtitle={`Invoiced ${formatINR(f.supplierInvoiced)} · paid ${formatINR(f.supplierPaid)} · pending ${formatINR(f.supplierPending)}`} bodyClassName="">
          <SupplierInvoiceTable views={supInvoices} showProject={false} onPay={(sid) => { setPaySupplierInv(sid); setModal('supplierPay') }} />
        </Card>
      )}

      {tab === 'changes' && (
        <Card title="Change orders / additional work" subtitle={`Original ${formatINR(f.originalContract)} + approved ${formatINR(f.changeOrderRevenue)} = revised ${formatINR(f.revenue)}`} bodyClassName=""
          actions={!isClosed && <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setModal('co')}>New change order</Button>}>
          <Table>
            <thead><tr><Th>CO number</Th><Th>Description</Th><Th>Date</Th><Th right>Additional revenue</Th><Th right>Estimated cost</Th><Th right>Expected profit</Th><Th>Phase</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {cos.length === 0 && <EmptyRow cols={9}>No change orders</EmptyRow>}
              {cos.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium text-navy-900">{c.number}</Td>
                  <Td>{c.description}</Td>
                  <Td>{formatDate(c.date)}</Td>
                  <Td right><Money value={c.revenue} /></Td>
                  <Td right><Money value={c.estimatedCost} /></Td>
                  <Td right><Money value={c.revenue - c.estimatedCost} className="text-emerald-700" /></Td>
                  <Td>{c.phaseId ? <Link to={`/phases/${c.phaseId}`} className="text-blue-600 hover:underline">{c.phaseId}</Link> : '—'}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td>
                    {c.status === 'Pending Approval' && !isClosed && (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="success" icon={<Check size={12} />} onClick={() => commit(A.approveChangeOrder(db, c.id), `${c.number} approved — revenue +${formatCompact(c.revenue)}`)}>Approve</Button>
                        <Button size="sm" onClick={() => commit(A.rejectChangeOrder(db, c.id), `${c.number} rejected`)}>Reject</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === 'documents' && (
        <Card title="Project documents" bodyClassName="" actions={<Button variant="primary" size="sm" icon={<Upload size={13} />} onClick={() => setModal('doc')}>Upload</Button>}>
          <DocumentTable docs={docs} />
        </Card>
      )}

      {!closable.ready && allDone && !isClosed && <div className="mt-5"><Callout tone="warning">All phases are complete. Bill the remaining {formatINR(f.unbilled)} to enable project closure.</Callout></div>}

      <ExpenseForm open={modal === 'expense'} onClose={close} defaults={{ projectId: project.id }} />
      <ClientInvoiceForm open={modal === 'invoice'} onClose={close} projectId={project.id} />
      <ClientPaymentForm open={modal === 'payment'} onClose={close} projectId={project.id} invoiceId={payInvoice} />
      <SupplierPaymentForm open={modal === 'supplierPay'} onClose={close} supplierInvoiceId={paySupplierInv} />
      <ChangeOrderForm open={modal === 'co'} onClose={close} projectId={project.id} />
      <PhaseForm open={modal === 'phase'} onClose={close} projectId={project.id} phaseId={budgetPhase} />
      {contract && <ContractUploadForm open={modal === 'contract'} onClose={close} contractId={contract.id} />}
      <CloseProjectDialog open={modal === 'close'} onClose={close} projectId={project.id} />
      <DocumentUploadForm open={modal === 'doc'} onClose={close} projectId={project.id} />
    </>
  )
}

// ---------------------------------------------------------------------------

function WorkflowStrip({ f, contractStatus }: { f: ProjectFinancials; contractStatus?: string }) {
  const steps = [
    { label: 'Quote', done: !!f.project.quotationId },
    { label: 'Contract', done: contractStatus === 'Active' || contractStatus === 'Completed' || contractStatus === 'Signed' },
    { label: 'Phases', done: f.phases.length > 0 && f.phases.some((p) => p.status !== 'Planned') },
    { label: 'Cost', done: f.actual.total > 0 },
    { label: 'Billing', done: f.billed > 0 && f.unbilled <= 0, partial: f.billed > 0 },
    { label: 'Payment', done: f.billed > 0 && f.clientPending <= 0 && f.unbilled <= 0, partial: f.received > 0 },
    { label: 'Profit', done: f.completion >= 100, partial: f.actual.total > 0 },
    { label: 'Closure', done: f.project.status === 'Closed' },
  ]
  const current = steps.findIndex((s) => !s.done)
  return (
    <div className="mb-5 flex items-center overflow-x-auto rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
      {steps.map((s, i) => (
        <div key={s.label} className="flex flex-1 shrink-0 items-center">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
              s.done ? 'bg-emerald-600 text-white' : i === current ? 'bg-blue-600 text-white ring-4 ring-blue-100' : s.partial ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400')}>
              {s.done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span className={clsx('text-xs font-medium', s.done ? 'text-emerald-700' : i === current ? 'text-blue-700' : 'text-slate-500')}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={clsx('mx-3 h-px min-w-4 flex-1', s.done ? 'bg-emerald-300' : 'bg-slate-200')} />}
        </div>
      ))}
    </div>
  )
}

export function ProfitabilityCard({ f }: { f: ProjectFinancials }) {
  return (
    <Card title="Project profitability" subtitle="Revenue − direct cost. Actual profit recognises revenue by % completion.">
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Stat label="Original contract">{formatINR(f.originalContract)}</Stat>
          <Stat label="+ Approved change orders">{formatINR(f.changeOrderRevenue)}</Stat>
          <Stat label="Total project revenue" strong>{formatINR(f.revenue)}</Stat>
          <Stat label="Earned revenue to date">{formatINR(f.earnedRevenue)}</Stat>
          <Stat label="Expected profit (at budget)">{formatINR(f.expectedProfit)} <span className="text-xs text-slate-400">· {formatPct(f.expectedMargin)}</span></Stat>
          <Stat label="Forecast profit at completion">{formatINR(f.forecastProfit)} <span className="text-xs text-slate-400">· {formatPct(f.forecastMargin)}</span></Stat>
        </div>
        <div>
          <Stat label="Material cost">{formatINR(f.actual.material)}</Stat>
          <Stat label="Own labour cost">{formatINR(f.actual.labour)}</Stat>
          <Stat label="Outsource cost">{formatINR(f.actual.outsource)}</Stat>
          <Stat label="Other direct cost">{formatINR(f.actual.other)}</Stat>
          <Stat label="Total project cost" strong>{formatINR(f.actual.total)}</Stat>
          <Stat label="Budget variance"><Variance value={f.budgetVariance} /></Stat>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
        <div>
          <div className="text-xs font-medium text-emerald-800">Actual profit (earned revenue − actual cost)</div>
          <div className="num text-[11px] text-emerald-700/80">{formatINR(f.earnedRevenue)} − {formatINR(f.actual.total)}</div>
        </div>
        <div className="text-right">
          <div className={clsx('num text-xl font-semibold', f.actualProfit >= 0 ? 'text-emerald-700' : 'text-red-600')}>{formatINR(f.actualProfit)}</div>
          <div className="num text-xs text-emerald-800">{formatPct(f.actualMargin)} margin</div>
        </div>
      </div>
    </Card>
  )
}

export function CashPositionCard({ f }: { f: ProjectFinancials }) {
  return (
    <Card title="Project cash position" subtitle="Cash is not profit — this tracks money actually in and out.">
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client</div>
          <Stat label="Total billed">{formatINR(f.billed)}</Stat>
          <Stat label="Total received"><span className="text-emerald-700">{formatINR(f.received)}</span></Stat>
          <Stat label="Client receivable" strong><span className="text-red-600">{formatINR(f.clientPending)}</span></Stat>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Suppliers</div>
          <Stat label="Supplier invoices">{formatINR(f.supplierInvoiced)}</Stat>
          <Stat label="Supplier paid">{formatINR(f.supplierPaid)}</Stat>
          <Stat label="Supplier payable" strong><span className="text-amber-700">{formatINR(f.supplierPending)}</span></Stat>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 px-4 py-2 ring-1 ring-slate-100">
        <Stat label="Client received">{formatINR(f.received)}</Stat>
        <Stat label="− Supplier payments">{formatINR(-f.supplierPaid)}</Stat>
        <Stat label="− Own labour & direct site payments">{formatINR(-f.directPaid)}</Stat>
        <Stat label="Project cash position" strong><span className={f.cashPosition >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatINR(f.cashPosition)}</span></Stat>
      </div>
    </Card>
  )
}

function PhaseTable({ projectId, onBudget, onAdd, readOnly }: { projectId: string; onBudget: (phaseId: string) => void; onAdd?: () => void; readOnly?: boolean }) {
  const { db, commit } = useStore()
  const phases = db.phases.filter((p) => p.projectId === projectId).sort((a, b) => a.sequence - b.sequence)
  return (
    <Card title="Phases" subtitle="Change status or progress here — project completion and profit update instantly." bodyClassName=""
      actions={onAdd && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={onAdd}>Add phase</Button>}>
      <Table>
        <thead><tr><Th>Phase</Th><Th right>Contract</Th><Th right>Planned cost</Th><Th right>Actual cost</Th><Th right>Variance</Th><Th right>Profit</Th><Th right>Billed</Th><Th right>Received</Th><Th>Progress</Th><Th>Status</Th><Th /></tr></thead>
        <tbody>
          {phases.length === 0 && <EmptyRow cols={11}>No phases</EmptyRow>}
          {phases.map((p) => {
            const pf = phaseFinancials(db, p)
            const done = ['Completed', 'Billed', 'Payment Received', 'Closed'].includes(p.status)
            return (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <Td><Link to={`/phases/${p.id}`} className="font-medium text-navy-900 hover:text-blue-600">{p.name}</Link><div className="text-xs text-slate-400">{p.id}{p.changeOrderId && ' · change order'}</div></Td>
                <Td right><Money value={p.contractValue} compact /></Td>
                <Td right><Money value={pf.planned.total} compact /></Td>
                <Td right><Money value={pf.actual.total} compact /></Td>
                <Td right><Variance value={pf.budgetVariance} compact /></Td>
                <Td right><Money value={pf.actualProfit} compact signTone /></Td>
                <Td right><Money value={pf.billed} compact /></Td>
                <Td right><Money value={pf.received} compact /></Td>
                <Td className="w-40">
                  {done || readOnly ? <Progress value={pf.completion} /> : (
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={100} step={5} value={p.progress} onChange={(e) => commit(A.setPhaseProgress(db, p.id, Number(e.target.value)))} className="h-1.5 flex-1 accent-blue-600" />
                      <span className="num w-9 text-right text-xs text-slate-600">{p.progress}%</span>
                    </div>
                  )}
                </Td>
                <Td><PhaseStatusSelect phase={p} disabled={readOnly} /></Td>
                <Td>{!readOnly && <button type="button" title="Set budget" onClick={() => onBudget(p.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Pencil size={14} /></button>}</Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Card>
  )
}
