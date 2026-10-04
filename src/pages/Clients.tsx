import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Mail, MapPin, Phone, Plus, Search, User } from 'lucide-react'
import { ClientForm, QuotationForm } from '../components/workflowForms'
import { Button, Card, EmptyRow, FilterBar, Input, Kpi, KpiGrid, Money, PageHeader, Progress, StatusBadge, Table, Td, Th } from '../components/ui'
import { clientFinancials, clientInvoicePaid, clientInvoiceStatus, projectFinancials, quotationTotals } from '../lib/calc'
import { formatCompact, formatDate } from '../lib/format'
import { useStore } from '../store/store'

export function Clients() {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const rows = db.clients
    .filter((c) => `${c.name} ${c.contactPerson} ${c.city}`.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ c, f: clientFinancials(db, c.id) }))

  return (
    <>
      <PageHeader title="Clients" subtitle="Client accounts, contracted value and outstanding balances." actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New client</Button>} />
      <Card bodyClassName="">
        <FilterBar>
          <div className="relative w-72"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><Input className="pl-9" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </FilterBar>
        <Table>
          <thead><tr><Th>Client</Th><Th>Contact</Th><Th>Project</Th><Th right>Contract value</Th><Th right>Billed</Th><Th right>Received</Th><Th right>Outstanding</Th><Th right>Active phases</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={8} />}
            {rows.map(({ c, f }) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <Td><Link to={`/clients/${c.id}`} className="font-medium text-navy-900 hover:text-blue-600">{c.name}</Link><div className="text-xs text-slate-400">{c.id} · {c.city}, {c.state}</div></Td>
                <Td><div className="text-slate-700">{c.contactPerson}</div><div className="text-xs text-slate-400">{c.phone}</div></Td>
                <Td>
                  {f.projects.length ? f.projects.map((p) => (
                    <div key={p.id} className="flex items-center gap-2"><Link to={`/projects/${p.id}`} className="text-slate-700 hover:text-blue-600">{p.shortName}</Link><StatusBadge status={p.status} /></div>
                  )) : <span className="text-xs text-slate-400">Lead — no project yet</span>}
                </Td>
                <Td right><Money value={f.contractValue} compact /></Td>
                <Td right><Money value={f.billed} compact /></Td>
                <Td right><Money value={f.received} compact className="text-emerald-700" /></Td>
                <Td right><Money value={f.pending} compact className={f.pending ? 'font-medium text-red-600' : ''} /></Td>
                <Td right>{f.activePhases}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <ClientForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function ClientDetail() {
  const { id } = useParams()
  const { db } = useStore()
  const [quoteOpen, setQuoteOpen] = useState(false)
  const c = db.clients.find((x) => x.id === id)
  if (!c) return <PageHeader title="Client not found" />
  const f = clientFinancials(db, c.id)
  const invoices = db.clientInvoices.filter((i) => f.projects.some((p) => p.id === i.projectId))
  const quotes = db.quotations.filter((x) => x.clientId === c.id)

  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.id} · Client since ${formatDate(c.createdAt)}`} crumbs={[{ label: 'Clients', to: '/clients' }, { label: c.name }]}
        actions={<Button icon={<Plus size={15} />} onClick={() => setQuoteOpen(true)}>New quotation</Button>} />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card title="Client information">
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-2.5"><User size={16} className="text-slate-400" />{c.contactPerson}</li>
            <li className="flex gap-2.5"><Phone size={16} className="text-slate-400" />{c.phone}</li>
            <li className="flex gap-2.5"><Mail size={16} className="text-slate-400" />{c.email}</li>
            <li className="flex gap-2.5"><MapPin size={16} className="text-slate-400" />{c.city}, {c.state}</li>
          </ul>
        </Card>
        <div className="space-y-5">
          <KpiGrid cols={4}>
            <Kpi label="Contract value" value={formatCompact(f.contractValue)} />
            <Kpi label="Amount billed" value={formatCompact(f.billed)} />
            <Kpi label="Amount received" value={formatCompact(f.received)} tone="positive" />
            <Kpi label="Outstanding balance" value={formatCompact(f.pending)} tone={f.pending ? 'negative' : 'neutral'} sub={f.overdue ? `${formatCompact(f.overdue)} overdue` : undefined} />
          </KpiGrid>
          <Card title="Projects" bodyClassName="">
            <Table>
              <thead><tr><Th>Project</Th><Th right>Contract</Th><Th right>Received</Th><Th right>Pending</Th><Th>Active phases</Th><Th>Completion</Th><Th>Status</Th></tr></thead>
              <tbody>
                {f.projects.length === 0 && <EmptyRow cols={7}>No project yet — create and approve a quotation to start one.</EmptyRow>}
                {f.projects.map((p) => {
                  const pf = projectFinancials(db, p.id)
                  return (
                    <tr key={p.id}>
                      <Td><Link to={`/projects/${p.id}`} className="font-medium text-navy-900 hover:text-blue-600">{p.name}</Link><div className="text-xs text-slate-400">{p.id}</div></Td>
                      <Td right><Money value={pf.revenue} compact /></Td>
                      <Td right><Money value={pf.received} compact /></Td>
                      <Td right><Money value={pf.clientPending} compact className={pf.clientPending ? 'text-red-600' : ''} /></Td>
                      <Td>{pf.phases.filter((x) => x.status === 'In Progress').map((x) => x.name).join(', ') || '—'}</Td>
                      <Td className="w-32"><Progress value={pf.completion} /></Td>
                      <Td><StatusBadge status={p.status} /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
          <Card title="Invoices" bodyClassName="">
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Description</Th><Th>Date</Th><Th right>Amount</Th><Th right>Received</Th><Th right>Pending</Th><Th>Status</Th></tr></thead>
              <tbody>
                {invoices.length === 0 && <EmptyRow cols={7} />}
                {invoices.map((i) => {
                  const paid = clientInvoicePaid(db, i.id)
                  return (
                    <tr key={i.id}>
                      <Td className="font-medium">{i.invoiceNumber}</Td><Td>{i.description}</Td><Td>{formatDate(i.invoiceDate)}</Td>
                      <Td right><Money value={i.amount} /></Td><Td right><Money value={paid} /></Td><Td right><Money value={i.amount - paid} /></Td>
                      <Td><StatusBadge status={clientInvoiceStatus(db, i)} /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
          <Card title="Quotations" bodyClassName="">
            <Table>
              <thead><tr><Th>Quote</Th><Th>Project</Th><Th>Date</Th><Th right>Value</Th><Th>Status</Th></tr></thead>
              <tbody>
                {quotes.length === 0 && <EmptyRow cols={5} />}
                {quotes.map((x) => (
                  <tr key={x.id}>
                    <Td><Link to={`/quotations/${x.id}`} className="font-medium text-navy-900 hover:text-blue-600">{x.id}</Link></Td>
                    <Td>{x.projectName}</Td><Td>{formatDate(x.quoteDate)}</Td><Td right><Money value={quotationTotals(db, x.id).value} /></Td><Td><StatusBadge status={x.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
      <QuotationForm open={quoteOpen} onClose={() => setQuoteOpen(false)} clientId={c.id} />
    </>
  )
}
