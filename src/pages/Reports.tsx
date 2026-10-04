import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, FileCheck2, Printer } from 'lucide-react'
import { Button, Card, Callout, EmptyRow, Money, PageHeader, Progress, Stat, StatusBadge, Table, Td, Th, Variance } from '../components/ui'
import { canCloseProject, phaseFinancials, portfolioSummary, projectFinancials } from '../lib/calc'
import { formatDate, formatINR, formatPct, monthsBetween } from '../lib/format'
import { useStore } from '../store/store'

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Reports() {
  const { db, notify } = useStore()
  const s = portfolioSummary(db)

  function exportPortfolio() {
    downloadCsv('portfolio-summary.csv', [
      ['Project ID', 'Project', 'Status', 'Revenue', 'Billed', 'Received', 'Client pending', 'Planned cost', 'Actual cost', 'Actual profit', 'Margin %', 'Supplier pending', 'Completion %'],
      ...s.fins.map((f) => [f.project.id, f.project.name, f.project.status, f.revenue, f.billed, f.received, f.clientPending, f.planned.total, f.actual.total, Math.round(f.actualProfit), f.actualMargin.toFixed(2), f.supplierPending, f.completion.toFixed(0)]),
    ])
    notify('Portfolio summary exported (CSV)')
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Project closure reports and portfolio exports." actions={<Button icon={<Download size={15} />} onClick={exportPortfolio}>Export portfolio CSV</Button>} />
      <Card title="Project closure reports" subtitle="Available for completed and closed projects. Active projects show a live preview." bodyClassName="">
        <Table>
          <thead><tr><Th>Project</Th><Th>Status</Th><Th>Completion</Th><Th right>Final revenue</Th><Th right>Cost</Th><Th right>Profit</Th><Th>Closed on</Th><Th /></tr></thead>
          <tbody>
            {s.fins.length === 0 && <EmptyRow cols={8} />}
            {s.fins.map((f) => {
              const closure = db.closures.find((c) => c.projectId === f.project.id)
              return (
                <tr key={f.project.id} className="hover:bg-slate-50/60">
                  <Td><Link to={`/projects/${f.project.id}`} className="font-medium text-navy-900 hover:text-blue-600">{f.project.name}</Link></Td>
                  <Td><StatusBadge status={f.project.status} /></Td>
                  <Td className="w-36"><Progress value={f.completion} /></Td>
                  <Td right><Money value={f.revenue} compact /></Td>
                  <Td right><Money value={f.actual.total} compact /></Td>
                  <Td right><Money value={f.actualProfit} compact signTone /></Td>
                  <Td>{closure ? formatDate(closure.closedDate) : '—'}</Td>
                  <Td><Link to={`/reports/closure/${f.project.id}`}><Button size="sm" variant={closure ? 'primary' : 'secondary'} icon={<FileCheck2 size={13} />}>{closure ? 'Closure report' : 'Preview report'}</Button></Link></Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
    </>
  )
}

export function ClosureReport() {
  const { id } = useParams()
  const { db, notify } = useStore()
  const project = db.projects.find((p) => p.id === id)
  if (!project) return <PageHeader title="Report not found" crumbs={[{ label: 'Reports', to: '/reports' }]} />
  const f = projectFinancials(db, project.id)
  const client = db.clients.find((c) => c.id === project.clientId)
  const closure = db.closures.find((c) => c.projectId === project.id)
  const { checks } = canCloseProject(db, project.id)
  const months = monthsBetween(project.startDate, project.endDate)

  function exportReport() {
    downloadCsv(`${project!.id}-closure-report.csv`, [
      ['Section', 'Item', 'Amount (INR)'],
      ['Revenue', 'Original contract', f.originalContract], ['Revenue', 'Change orders', f.changeOrderRevenue], ['Revenue', 'Final contract value', f.revenue],
      ['Revenue', 'Total billed', f.billed], ['Revenue', 'Total received', f.received], ['Revenue', 'Client pending', f.clientPending],
      ['Expenses', 'Materials', f.actual.material], ['Expenses', 'Own labour', f.actual.labour], ['Expenses', 'Outsource', f.actual.outsource], ['Expenses', 'Other direct', f.actual.other], ['Expenses', 'Total cost', f.actual.total],
      ['Profitability', 'Expected profit', f.expectedProfit], ['Profitability', 'Actual profit', Math.round(f.actualProfit)], ['Profitability', 'Profit margin %', f.actualMargin.toFixed(2)], ['Profitability', 'Budget variance', f.budgetVariance],
      ['Suppliers', 'Total supplier invoices', f.supplierInvoiced], ['Suppliers', 'Paid', f.supplierPaid], ['Suppliers', 'Pending', f.supplierPending],
    ])
    notify('Closure report exported')
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Reports', to: '/reports' }, { label: project.id }]}
        title="Project Closure Report"
        subtitle={`${project.name} · ${project.id}`}
        actions={<><Button icon={<Printer size={15} />} onClick={() => window.print()}>Print / PDF</Button><Button variant="primary" icon={<Download size={15} />} onClick={exportReport}>Export report</Button></>}
      />
      {!closure && (
        <div className="no-print mb-5">
          <Callout tone="warning">This project is not closed yet — figures below are a live preview. {project.status !== 'Closed' && <Link to={`/projects/${project.id}`} className="font-semibold underline">Go to project to close it</Link>}</Callout>
        </div>
      )}

      <div className="mx-auto max-w-5xl space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-blue-600">Final project financial summary</div>
            <h2 className="mt-1 text-2xl font-semibold text-navy-900">{project.name}</h2>
            <div className="mt-1 text-sm text-slate-500">{client?.name} · {project.location}</div>
          </div>
          <div className="text-right">
            <StatusBadge status={project.status} className="text-xs" />
            {closure && <div className="mt-2 text-xs text-slate-500">Closed {formatDate(closure.closedDate)} by {closure.closedBy}</div>}
          </div>
        </div>

        <Section title="Project information">
          <div className="grid grid-cols-2 gap-x-10 md:grid-cols-3">
            <Stat label="Project">{project.shortName}</Stat>
            <Stat label="Client">{client?.name}</Stat>
            <Stat label="Contract">{db.contracts.find((c) => c.projectId === project.id)?.id ?? '—'}</Stat>
            <Stat label="Duration">{formatDate(project.startDate)} → {formatDate(project.endDate)} ({months} months)</Stat>
            <Stat label="Project manager">{project.projectManager}</Stat>
            <Stat label="Phases">{f.phases.length}</Stat>
          </div>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Revenue">
            <Stat label="Original contract">{formatINR(f.originalContract)}</Stat>
            <Stat label="Change orders">{formatINR(f.changeOrderRevenue)}</Stat>
            <Stat label="Final contract value" strong>{formatINR(f.revenue)}</Stat>
            <Stat label="Total billed">{formatINR(f.billed)}</Stat>
            <Stat label="Total received"><span className="text-emerald-700">{formatINR(f.received)}</span></Stat>
            <Stat label="Client pending" strong><span className={f.clientPending ? 'text-red-600' : ''}>{formatINR(f.clientPending)}</span></Stat>
          </Section>
          <Section title="Expenses">
            <Stat label="Materials">{formatINR(f.actual.material)}</Stat>
            <Stat label="Own labour">{formatINR(f.actual.labour)}</Stat>
            <Stat label="Outsource">{formatINR(f.actual.outsource)}</Stat>
            <Stat label="Other direct cost">{formatINR(f.actual.other)}</Stat>
            <Stat label="Planned cost">{formatINR(f.planned.total)}</Stat>
            <Stat label="Total cost" strong>{formatINR(f.actual.total)}</Stat>
          </Section>
        </div>

        <Section title="Profitability">
          <div className="grid items-center gap-6 md:grid-cols-[1fr_280px]">
            <div>
              <Stat label="Expected profit (at quotation budget)">{formatINR(f.expectedProfit)} <span className="text-xs text-slate-400">· {formatPct(f.expectedMargin)}</span></Stat>
              <Stat label="Actual profit">{formatINR(f.actualProfit)}</Stat>
              <Stat label="Profit margin">{formatPct(f.actualMargin, 2)}</Stat>
              <Stat label="Budget variance (actual − planned)"><Variance value={f.budgetVariance} /></Stat>
              <Stat label="Profit variance vs expected"><Money value={f.actualProfit - f.expectedProfit * (f.earnedRevenue / (f.revenue || 1))} signTone /></Stat>
            </div>
            <div className="rounded-xl bg-navy-900 p-5 text-white">
              <div className="text-xs uppercase tracking-wide text-slate-300">Final profit</div>
              <div className="num mt-1 text-xs text-slate-400">{formatINR(f.earnedRevenue)} − {formatINR(f.actual.total)}</div>
              <div className="num mt-1 text-3xl font-semibold">{formatINR(f.actualProfit)}</div>
              <div className="mt-1 text-sm text-emerald-300">{formatPct(f.actualMargin, 2)} margin</div>
            </div>
          </div>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Supplier settlement">
            <Stat label="Total supplier invoices">{formatINR(f.supplierInvoiced)}</Stat>
            <Stat label="Paid">{formatINR(f.supplierPaid)}</Stat>
            <Stat label="Pending" strong><span className={f.supplierPending ? 'text-red-600' : ''}>{formatINR(f.supplierPending)}</span></Stat>
            <Stat label="Own labour & direct costs (paid at site)">{formatINR(f.directPaid)}</Stat>
          </Section>
          <Section title="Final status">
            <Stat label="Project status"><StatusBadge status={project.status} /></Stat>
            <Stat label="Completion">{formatPct(f.completion, 0)}</Stat>
            <Stat label="Cash position (received − paid out)"><Money value={f.cashPosition} signTone /></Stat>
            {closure?.notes && <Stat label="Notes">{closure.notes}</Stat>}
          </Section>
        </div>

        <Section title="Phase summary">
          <Table>
            <thead><tr><Th>Phase</Th><Th right>Revenue</Th><Th right>Planned</Th><Th right>Actual</Th><Th right>Profit</Th><Th right>Billed</Th><Th right>Received</Th><Th>Status</Th></tr></thead>
            <tbody>
              {f.phases.map((p) => {
                const pf = phaseFinancials(db, p)
                return (
                  <tr key={p.id}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td right><Money value={pf.revenue} /></Td><Td right><Money value={pf.planned.total} /></Td><Td right><Money value={pf.actual.total} /></Td>
                    <Td right><Money value={pf.actualProfit} signTone /></Td><Td right><Money value={pf.billed} /></Td><Td right><Money value={pf.received} /></Td>
                    <Td><StatusBadge status={p.status} /></Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Section>

        <Section title="Closure checklist">
          <ul className="grid gap-1.5 text-sm md:grid-cols-2">
            {checks.map((c) => <li key={c.label} className={c.ok ? 'text-slate-700' : 'text-red-600'}>{c.ok ? '✓' : '✗'} {c.label}{c.note && <span className="text-xs text-slate-400"> · {c.note}</span>}</li>)}
          </ul>
        </Section>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

