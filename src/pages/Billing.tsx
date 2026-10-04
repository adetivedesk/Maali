import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { ClientInvoiceForm, ClientPaymentForm } from '../components/forms'
import { ClientInvoiceTable } from '../components/tables'
import { Button, Card, EmptyRow, FilterBar, Kpi, KpiGrid, Money, PageHeader, Progress, Select, StatusBadge, Table, Td, Th } from '../components/ui'
import { clientInvoiceStatus, phaseFinancials, portfolioSummary } from '../lib/calc'
import { formatCompact } from '../lib/format'
import { useStore } from '../store/store'

export function Billing() {
  const { db } = useStore()
  const [status, setStatus] = useState('')
  const [project, setProject] = useState('')
  const [invoiceFor, setInvoiceFor] = useState<{ projectId?: string; phaseId?: string } | null>(null)
  const [payFor, setPayFor] = useState<string | undefined | null>(null)
  const s = portfolioSummary(db)
  const invoices = db.clientInvoices
    .filter((i) => !project || i.projectId === project)
    .filter((i) => !status || clientInvoiceStatus(db, i) === status)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))

  // Phases with work done but value not yet billed
  const unbilled = db.phases
    .filter((p) => !['Planned', 'Closed'].includes(p.status))
    .map((p) => ({ p, f: phaseFinancials(db, p) }))
    .filter(({ f }) => f.unbilled > 0)
    .sort((a, b) => b.f.completion - a.f.completion)

  return (
    <>
      <PageHeader title="Client Billing" subtitle="Billing is tracked separately from revenue: contract value → invoices → receipts."
        actions={<><Button onClick={() => setPayFor(undefined)}>Record client payment</Button><Button variant="primary" icon={<Receipt size={15} />} onClick={() => setInvoiceFor({})}>Generate invoice</Button></>} />
      <KpiGrid cols={5}>
        <Kpi label="Total revenue" value={formatCompact(s.contractValue)} />
        <Kpi label="Billed" value={formatCompact(s.billed)} sub={`${db.clientInvoices.length} invoices`} />
        <Kpi label="Received" value={formatCompact(s.received)} tone="positive" />
        <Kpi label="Receivable" value={formatCompact(s.clientReceivable)} tone="negative" />
        <Kpi label="Overdue" value={formatCompact(s.clientOverdue)} tone="negative" sub={`${db.clientInvoices.filter((i) => clientInvoiceStatus(db, i) === 'Overdue').length} invoices`} />
      </KpiGrid>

      <Card className="mt-5" title="Ready to bill" subtitle="Phases in progress or completed with unbilled contract value." bodyClassName="">
        <Table>
          <thead><tr><Th>Phase</Th><Th>Project</Th><Th>Status</Th><Th>Completion</Th><Th right>Phase value</Th><Th right>Billed</Th><Th right>Earned − billed</Th><Th right>Unbilled</Th><Th /></tr></thead>
          <tbody>
            {unbilled.length === 0 && <EmptyRow cols={9}>Everything is billed</EmptyRow>}
            {unbilled.map(({ p, f }) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <Td><Link to={`/phases/${p.id}`} className="font-medium text-navy-900 hover:text-blue-600">{p.name}</Link></Td>
                <Td>{db.projects.find((x) => x.id === p.projectId)?.shortName}</Td>
                <Td><StatusBadge status={p.status} /></Td>
                <Td className="w-32"><Progress value={f.completion} /></Td>
                <Td right><Money value={f.revenue} /></Td>
                <Td right><Money value={f.billed} /></Td>
                <Td right><Money value={Math.max(f.earnedRevenue - f.billed, 0)} className={f.earnedRevenue - f.billed > 0 ? 'font-medium text-blue-700' : 'text-slate-400'} /></Td>
                <Td right><Money value={f.unbilled} /></Td>
                <Td><Button size="sm" variant={p.status === 'Completed' ? 'primary' : 'secondary'} onClick={() => setInvoiceFor({ projectId: p.projectId, phaseId: p.id })}>{p.status === 'Completed' ? 'Bill now' : 'Running bill'}</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-5" title="Client invoices" subtitle="Expand a row for payment history." bodyClassName="">
        <FilterBar>
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['Billed', 'Partially Paid', 'Paid', 'Overdue'].map((x) => <option key={x}>{x}</option>)}</Select>
          <Select className="w-52" value={project} onChange={(e) => setProject(e.target.value)}><option value="">All projects</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select>
        </FilterBar>
        <ClientInvoiceTable invoices={invoices} onPay={(id) => setPayFor(id)} />
      </Card>

      <ClientInvoiceForm open={invoiceFor !== null} onClose={() => setInvoiceFor(null)} projectId={invoiceFor?.projectId} phaseId={invoiceFor?.phaseId} />
      <ClientPaymentForm open={payFor !== null} onClose={() => setPayFor(null)} invoiceId={payFor ?? undefined} />
    </>
  )
}
