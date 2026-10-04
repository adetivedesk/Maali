import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, Plus, Receipt } from 'lucide-react'
import { BarsChart, COST_COLORS, SERIES } from '../components/charts'
import { ClientInvoiceForm, ClientPaymentForm, ExpenseForm } from '../components/forms'
import { ClientInvoiceTable, ExpenseTable, PhaseStatusSelect, PlannedVsActualTable, SupplierInvoiceTable } from '../components/tables'
import { Button, Card, Kpi, KpiGrid, PageHeader, Progress } from '../components/ui'
import { PhaseForm } from '../components/workflowForms'
import { COST_CATEGORIES, COST_LABEL, phaseFinancials, supplierInvoiceView } from '../lib/calc'
import { formatCompact, formatDate, formatINR, formatPct } from '../lib/format'
import * as A from '../store/actions'
import { useStore } from '../store/store'
import type { CostCategory } from '../data/types'

export function PhaseDetail() {
  const { id } = useParams()
  const { db, commit } = useStore()
  const [modal, setModal] = useState<null | 'expense' | 'invoice' | 'payment' | 'budget'>(null)
  const [expCat, setExpCat] = useState<CostCategory | undefined>()
  const [payInv, setPayInv] = useState<string | undefined>()
  const phase = db.phases.find((p) => p.id === id)
  if (!phase) return <PageHeader title="Phase not found" crumbs={[{ label: 'Phases', to: '/phases' }]} />
  const project = db.projects.find((p) => p.id === phase.projectId)!
  const f = phaseFinancials(db, phase)
  const expenses = db.expenses.filter((e) => e.phaseId === phase.id).sort((a, b) => b.date.localeCompare(a.date))
  const invoices = db.clientInvoices.filter((i) => i.phaseId === phase.id)
  const sins = db.supplierInvoices.map((i) => supplierInvoiceView(db, i)).filter((v) => v.phaseIds.includes(phase.id))
  const closed = phase.status === 'Closed'
  const done = ['Completed', 'Billed', 'Payment Received', 'Closed'].includes(phase.status)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Projects', to: '/projects' }, { label: project.shortName, to: `/projects/${project.id}` }, { label: phase.name }]}
        title={phase.name}
        subtitle={<>{phase.id} · <Link to={`/projects/${project.id}`} className="hover:text-blue-600">{project.name}</Link> · {formatDate(phase.startDate)} → {formatDate(phase.endDate)}</>}
        actions={!closed && (
          <>
            <PhaseStatusSelect phase={phase} />
            <Button icon={<Pencil size={14} />} onClick={() => setModal('budget')}>Set budget</Button>
            <Button icon={<Plus size={15} />} onClick={() => { setExpCat(undefined); setModal('expense') }}>Add expense</Button>
            <Button variant="primary" icon={<Receipt size={15} />} disabled={f.unbilled <= 0} onClick={() => setModal('invoice')}>Generate invoice</Button>
          </>
        )}
      />

      {!done && !closed && (
        <Card className="mb-5" bodyClassName="flex items-center gap-4 px-5 py-3">
          <span className="text-sm font-medium text-slate-600">Physical progress</span>
          <input type="range" min={0} max={100} step={5} value={phase.progress} onChange={(e) => commit(A.setPhaseProgress(db, phase.id, Number(e.target.value)))} className="h-1.5 flex-1 accent-blue-600" />
          <span className="num w-12 text-right text-sm font-semibold">{phase.progress}%</span>
          <Button size="sm" variant="success" onClick={() => commit(A.setPhaseStatus(db, phase.id, 'Completed'), `${phase.name} marked completed`)}>Mark completed</Button>
        </Card>
      )}

      <KpiGrid cols={5}>
        <Kpi label="Contract revenue" value={formatINR(f.revenue)} sub={`earned ${formatCompact(f.earnedRevenue)}`} />
        <Kpi label="Planned cost" value={formatINR(f.planned.total)} sub={`expected profit ${formatCompact(f.expectedProfit)}`} />
        <Kpi label="Actual cost" value={formatINR(f.actual.total)} tone={f.budgetVariance > 0 ? 'negative' : 'neutral'} sub={`${formatPct(f.budgetUsedPct, 0)} of budget`} />
        <Kpi label="Actual profit" value={formatINR(f.actualProfit)} tone={f.actualProfit >= 0 ? 'positive' : 'negative'} />
        <Kpi label="Profit margin" value={formatPct(f.actualMargin, 2)} tone="positive" sub={`expected ${formatPct(f.expectedMargin)}`} />
        <Kpi label="Billed" value={formatINR(f.billed)} sub={`${formatCompact(f.unbilled)} unbilled`} />
        <Kpi label="Received" value={formatINR(f.received)} tone="positive" />
        <Kpi label="Pending" value={formatINR(f.clientPending)} tone={f.clientPending ? 'negative' : 'neutral'} />
        <Kpi label="Forecast profit" value={formatINR(f.forecastProfit)} sub="at completion" />
        <Kpi label="Completion" value={formatPct(f.completion, 0)} sub={<Progress value={f.completion} className="mt-1" />} />
      </KpiGrid>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {COST_CATEGORIES.map((k) => {
          const used = f.planned[k] ? (f.actual[k] / f.planned[k]) * 100 : 0
          return (
            <button key={k} type="button" disabled={closed} onClick={() => { setExpCat(k); setModal('expense') }} className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 disabled:hover:border-slate-200">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COST_COLORS[k] }} />{COST_LABEL[k]} cost</div>
              <div className="num mt-1 text-lg font-semibold text-navy-900">{formatINR(f.actual[k])}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={used > 100 ? 'h-full bg-red-600' : 'h-full bg-blue-600'} style={{ width: `${Math.min(used, 100)}%` }} /></div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>budget {formatCompact(f.planned[k])}</span><span className={used > 100 ? 'font-semibold text-red-600' : ''}>{formatPct(used, 0)}</span></div>
            </button>
          )
        })}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Planned vs Actual" bodyClassName=""><PlannedVsActualTable planned={f.planned} actual={f.actual} completion={f.completion} /></Card>
        <Card title="Planned vs Actual chart">
          <BarsChart height={230} xKey="name" data={COST_CATEGORIES.map((k) => ({ name: COST_LABEL[k], planned: f.planned[k], actual: f.actual[k] }))}
            series={[{ key: 'planned', label: 'Planned', color: SERIES.blue }, { key: 'actual', label: 'Actual', color: SERIES.orange }]} />
        </Card>
      </div>

      <Card className="mt-5" title="Expenses" subtitle={`${expenses.length} entries`} bodyClassName="" actions={!closed && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setExpCat(undefined); setModal('expense') }}>Add expense</Button>}>
        <ExpenseTable expenses={expenses} showProject={false} showPhase={false} allowDelete={!closed} />
      </Card>

      <div className="mt-5 grid gap-5">
        <Card title="Client billing for this phase" bodyClassName="">
          <ClientInvoiceTable invoices={invoices} showProject={false} onPay={closed ? undefined : (iid) => { setPayInv(iid); setModal('payment') }} />
        </Card>
        <Card title="Supplier invoices for this phase" bodyClassName="">
          <SupplierInvoiceTable views={sins} showProject={false} />
        </Card>
      </div>

      <ExpenseForm open={modal === 'expense'} onClose={() => setModal(null)} defaults={{ projectId: project.id, phaseId: phase.id, category: expCat }} />
      <ClientInvoiceForm open={modal === 'invoice'} onClose={() => setModal(null)} projectId={project.id} phaseId={phase.id} />
      <ClientPaymentForm open={modal === 'payment'} onClose={() => setModal(null)} invoiceId={payInv} projectId={project.id} />
      <PhaseForm open={modal === 'budget'} onClose={() => setModal(null)} projectId={project.id} phaseId={phase.id} />
    </>
  )
}
