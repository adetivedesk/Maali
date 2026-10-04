import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Banknote, Briefcase, Coins, HandCoins, PiggyBank, Receipt, TrendingUp, Truck } from 'lucide-react'
import { BarsChart, COST_COLORS, SERIES, SignedBars, SplitMeter } from '../components/charts'
import { Card, Kpi, KpiGrid, Money, PageHeader, Progress, StatusBadge, Table, Td, Th } from '../components/ui'
import {
  clientInvoicePending, clientInvoiceStatus, phaseBilling, phaseFinancials, portfolioSummary, supplierInvoiceView,
} from '../lib/calc'
import { formatCompact, formatDate, formatPct } from '../lib/format'
import { useStore } from '../store/store'

export function Dashboard() {
  const { db } = useStore()
  const s = portfolioSummary(db)
  const shortName = (id: string) => db.projects.find((p) => p.id === id)?.shortName ?? id

  const chartData = s.fins.map((f) => ({
    name: f.project.shortName,
    revenue: f.revenue,
    cost: f.actual.total,
    planned: f.planned.total,
    material: f.actual.material,
    labour: f.actual.labour,
    outsource: f.actual.outsource,
    other: f.actual.other,
  }))

  // Attention items
  const overdueClient = db.clientInvoices.filter((i) => clientInvoiceStatus(db, i) === 'Overdue')
  const overdueSupplier = db.supplierInvoices.map((i) => supplierInvoiceView(db, i)).filter((v) => v.status === 'Overdue')
  const overBudget = db.phases.map((p) => ({ p, f: phaseFinancials(db, p) })).filter(({ f }) => f.budgetVariance > 0 && f.actual.total > 0)
  const unbilled = db.phases.filter((p) => p.status === 'Completed' && phaseBilling(db, p.id).billed < p.contractValue)
  const pendingCO = db.changeOrders.filter((c) => c.status === 'Pending Approval')
  const pendingContracts = db.contracts.filter((c) => c.status === 'Pending Signature')
  const approvedQuotes = db.quotations.filter((q) => q.status === 'Approved' && !q.projectId)

  const statusOrder = ['Active', 'On Hold', 'Contract Pending', 'Completed', 'Closed']

  return (
    <>
      <PageHeader title="Management Dashboard" subtitle="Portfolio-wide view of contracted value, cash, cost and profit." />

      <KpiGrid cols={5}>
        <Kpi label="Contract Value" value={formatCompact(s.contractValue)} sub={`${s.activeProjects} active of ${s.totalProjects} projects · incl. COs`} icon={<Coins size={16} />} to="/projects" />
        <Kpi label="Billed" value={formatCompact(s.billed)} sub={`billed profit ${formatCompact(s.billedProfit)}`} icon={<Briefcase size={16} />} to="/billing" />
        <Kpi label="Received" value={formatCompact(s.received)} sub="cash collected" tone="positive" icon={<Banknote size={16} />} to="/payments" />
        <Kpi label="Client Receivable" value={formatCompact(s.clientReceivable)} sub={<span className={s.clientOverdue ? 'text-red-600' : ''}>{formatCompact(s.clientOverdue)} overdue</span>} tone="negative" icon={<HandCoins size={16} />} to="/billing" />
        <Kpi label="Supplier Payable" value={formatCompact(s.supplierPayable)} sub={<span className={s.supplierOverdue ? 'text-red-600' : ''}>{formatCompact(s.supplierOverdue)} overdue</span>} tone="warning" icon={<Truck size={16} />} to="/suppliers" />
        <Kpi label="Planned Cost" value={formatCompact(s.plannedCost)} sub="original estimated cost" icon={<Receipt size={16} />} to="/profitability" />
        <Kpi label="Actual Cost" value={formatCompact(s.actualCost)} sub={`${formatCompact(s.wipCost)} in work in progress`} icon={<Receipt size={16} />} to="/expenses" />
        <Kpi label="Completed Revenue" value={formatCompact(s.completedRevenue)} sub="value of completed phases" icon={<Coins size={16} />} to="/phases" />
        <Kpi label="Actual Profit" value={formatCompact(s.actualProfit)} sub={`${formatPct(s.averageMargin)} on completed phases`} tone="positive" icon={<PiggyBank size={16} />} to="/profitability" />
        <Kpi label="Forecast Profit" value={formatCompact(s.forecastProfit)} sub={`${formatPct(s.forecastMargin)} at completion`} tone="positive" icon={<TrendingUp size={16} />} to="/profitability" />
      </KpiGrid>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Project Revenue vs Cost" subtitle="Total revenue (contract + change orders) against actual cost to date">
          <BarsChart data={chartData} xKey="name" series={[{ key: 'revenue', label: 'Revenue', color: SERIES.blue }, { key: 'cost', label: 'Actual cost', color: SERIES.orange }]} />
        </Card>
        <Card title="Planned Cost vs Actual Cost" subtitle="Total budget against cost booked so far">
          <BarsChart data={chartData} xKey="name" series={[{ key: 'planned', label: 'Planned cost', color: SERIES.blue }, { key: 'cost', label: 'Actual cost', color: SERIES.orange }]} />
        </Card>
        <Card title="Project Profitability" subtitle="Actual profit on completed phases (contract value − actual cost)">
          <SignedBars data={s.fins.map((f) => ({ name: f.project.shortName, value: Math.round(f.actualProfit) }))} label="Actual profit" />
        </Card>
        <Card title="Cost Distribution" subtitle="Actual cost by category">
          <BarsChart
            stacked
            data={chartData}
            xKey="name"
            height={232}
            series={[
              { key: 'material', label: 'Material', color: COST_COLORS.material },
              { key: 'labour', label: 'Own labour', color: COST_COLORS.labour },
              { key: 'outsource', label: 'Outsource', color: COST_COLORS.outsource },
              { key: 'other', label: 'Other direct', color: COST_COLORS.other },
            ]}
          />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Client Receivable" subtitle={`Total billed ${formatCompact(s.billed)}`}>
          <SplitMeter parts={[
            { label: 'Received', value: s.received, color: SERIES.blue },
            { label: 'Pending', value: s.clientReceivable - s.clientOverdue, color: SERIES.orange },
            { label: 'Overdue', value: s.clientOverdue, color: '#d03b3b' },
          ]} />
        </Card>
        <Card title="Supplier Payable" subtitle={`Total supplier invoices ${formatCompact(s.supplierInvoiced)}`}>
          <SplitMeter parts={[
            { label: 'Paid', value: s.supplierPaid, color: SERIES.blue },
            { label: 'Pending', value: s.supplierPayable - s.supplierOverdue, color: SERIES.orange },
            { label: 'Overdue', value: s.supplierOverdue, color: '#d03b3b' },
          ]} />
        </Card>
        <Card title="Project Status">
          <div className="space-y-2.5">
            {statusOrder.map((st) => {
              const n = s.statusCounts[st] ?? 0
              return (
                <div key={st} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 sm:w-36"><StatusBadge status={st} /></div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy-700" style={{ width: `${(n / Math.max(db.projects.length, 1)) * 100}%` }} /></div>
                  <span className="num w-6 text-right text-sm font-semibold text-navy-900">{n}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Projects" className="lg:col-span-2" bodyClassName="" actions={<Link to="/projects" className="text-xs font-medium text-blue-600 hover:underline">View all</Link>}>
          <Table>
            <thead><tr><Th>Project</Th><Th right>Revenue</Th><Th right>Received</Th><Th right>Cost</Th><Th right>Profit</Th><Th>Completion</Th><Th>Status</Th></tr></thead>
            <tbody>
              {s.fins.map((f) => (
                <tr key={f.project.id} className="hover:bg-slate-50/60">
                  <Td><Link to={`/projects/${f.project.id}`} className="font-medium text-navy-900 hover:text-blue-600">{f.project.shortName}</Link><div className="text-xs text-slate-400">{f.project.id}</div></Td>
                  <Td right><Money value={f.revenue} compact /></Td>
                  <Td right><Money value={f.received} compact /></Td>
                  <Td right><Money value={f.actual.total} compact /></Td>
                  <Td right><Money value={f.actualProfit} compact signTone /></Td>
                  <Td className="w-36"><Progress value={f.completion} /></Td>
                  <Td><StatusBadge status={f.project.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Needs Attention" subtitle="Items that need follow-up today" bodyClassName="divide-y divide-slate-100">
          {approvedQuotes.map((q) => <Attention key={q.id} to={`/quotations/${q.id}`} tone="info" text={`${q.id} approved — convert to project`} />)}
          {pendingContracts.map((c) => <Attention key={c.id} to="/contracts" tone="info" text={`${c.id} awaiting signed contract upload`} />)}
          {unbilled.map((p) => <Attention key={p.id} to={`/phases/${p.id}`} tone="warning" text={`${shortName(p.projectId)} · ${p.name} completed but not fully billed`} />)}
          {pendingCO.map((c) => <Attention key={c.id} to={`/projects/${c.projectId}?tab=changes`} tone="warning" text={`${c.number} pending client approval (${formatCompact(c.revenue)})`} />)}
          {overdueClient.map((i) => <Attention key={i.id} to="/billing" tone="danger" text={`${i.invoiceNumber} overdue since ${formatDate(i.dueDate)} — ${formatCompact(clientInvoicePending(db, i))} to collect`} />)}
          {overdueSupplier.map((v) => <Attention key={v.id} to={`/suppliers/${v.supplierId}`} tone="danger" text={`${db.suppliers.find((x) => x.id === v.supplierId)?.name} ${v.invoiceNumber} overdue — ${formatCompact(v.pending)}`} />)}
          {overBudget.map(({ p, f }) => <Attention key={p.id} to={`/phases/${p.id}`} tone="warning" text={`${shortName(p.projectId)} · ${p.name} over budget by ${formatCompact(f.budgetVariance)}`} />)}
        </Card>
      </div>
    </>
  )
}

function Attention({ to, text, tone }: { to: string; text: string; tone: 'info' | 'warning' | 'danger' }) {
  const color = { info: 'text-blue-600', warning: 'text-amber-600', danger: 'text-red-600' }[tone]
  return (
    <Link to={to} className="group flex items-start gap-2.5 px-4 py-2.5 sm:px-5 text-[13px] text-slate-700 hover:bg-slate-50">
      <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${color}`} />
      <span className="flex-1">{text}</span>
      <ArrowRight size={14} className="mt-0.5 shrink-0 text-slate-300 group-hover:text-blue-600" />
    </Link>
  )
}
