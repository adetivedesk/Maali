import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ban, Printer } from 'lucide-react'
import { ClientPaymentForm, SupplierPaymentForm } from '../components/forms'
import { askReason, Button, Can, Card, EmptyRow, FilterBar, IconAction, Kpi, KpiGrid, Money, PageHeader, Select, Table, Tabs, Td, Th } from '../components/ui'
import { PAYMENT_METHODS } from '../data/types'
import { formatCompact, formatDate, formatINR } from '../lib/format'
import { useStore } from '../store/store'

type Tab = 'client' | 'supplier'

export function Payments() {
  const { db, run, can } = useStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('client')
  const [project, setProject] = useState('')
  const [method, setMethod] = useState('')
  const [modal, setModal] = useState<Tab | null>(null)

  const client = db.clientPayments
    .map((p) => ({ p, inv: db.clientInvoices.find((i) => i.id === p.clientInvoiceId)! }))
    .filter(({ inv, p }) => (!project || inv.projectId === project) && (!method || p.method === method))
    .sort((a, b) => b.p.date.localeCompare(a.p.date))
  const supplier = db.supplierPayments
    .map((p) => ({ p, inv: db.supplierInvoices.find((i) => i.id === p.supplierInvoiceId)! }))
    .filter(({ inv, p }) => (!project || inv.projectId === project) && (!method || p.method === method))
    .sort((a, b) => b.p.date.localeCompare(a.p.date))

  const inflow = client.reduce((a, x) => a + x.p.amount, 0)
  const outflow = supplier.reduce((a, x) => a + x.p.amount, 0)
  const discounts = supplier.reduce((a, x) => a + (x.p.discount ?? 0), 0)

  return (
    <>
      <PageHeader title="Payments" subtitle="Money in from clients and money out to suppliers."
        actions={<><Can menu="payments"><Button onClick={() => setModal('supplier')}>Record supplier payment</Button></Can><Can menu="payments"><Button variant="primary" onClick={() => setModal('client')}>Record client payment</Button></Can></>} />
      <KpiGrid cols={3}>
        <Kpi label="Client receipts" value={formatCompact(inflow)} tone="positive" sub={`${client.length} payments`} />
        <Kpi label="Supplier payments" value={formatCompact(outflow)} tone="warning" sub={`${supplier.length} payments${discounts ? ` · ${formatCompact(discounts)} discounts received` : ''}`} />
        <Kpi label="Net (receipts − supplier payments)" value={formatCompact(inflow - outflow)} tone={inflow - outflow >= 0 ? 'positive' : 'negative'} sub="excludes labour paid at site" />
      </KpiGrid>
      <div className="mt-5">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'client', label: 'Client receipts', count: client.length }, { id: 'supplier', label: 'Supplier payments', count: supplier.length }]} />
      </div>
      <Card bodyClassName="">
        <FilterBar>
          <Select className="w-52" value={project} onChange={(e) => setProject(e.target.value)}><option value="">All projects</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select>
          <Select className="w-44" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
        </FilterBar>
        {tab === 'client' ? (
          <Table>
            <thead><tr><Th>Payment</Th><Th>Date</Th><Th>Invoice</Th><Th>Project</Th><Th>Phase</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th><Th /></tr></thead>
            <tbody>
              {client.length === 0 && <EmptyRow cols={9} />}
              {client.map(({ p, inv }) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <Td className="font-mono text-xs">{p.id}</Td><Td className="whitespace-nowrap">{formatDate(p.date)}</Td><Td className="font-medium">{inv.invoiceNumber}</Td>
                  <Td><Link to={`/projects/${inv.projectId}`} className="hover:text-blue-600">{db.projects.find((x) => x.id === inv.projectId)?.shortName}</Link></Td>
                  <Td>{db.phases.find((x) => x.id === inv.phaseId)?.name}</Td><Td>{p.method}</Td><Td className="text-slate-500">{p.reference}</Td>
                  <Td right><Money value={p.amount} className="font-medium text-emerald-700" /></Td>
                  <Td className="whitespace-nowrap">
                    <IconAction title="Print receipt" tone="blue" onClick={() => navigate(`/print/receipt/${p.id}`)}><Printer size={14} /></IconAction>
                    {can('payments', 'delete') && <IconAction title="Cancel payment" tone="red" onClick={() => { const r = askReason(`receipt ${p.id} of ${formatINR(p.amount)}`); if (r) void run('cancelClientPayment', [p.id, r], { success: `${p.id} cancelled` }) }}><Ban size={14} /></IconAction>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead><tr><Th>Payment</Th><Th>Date</Th><Th>Supplier</Th><Th>Invoice</Th><Th>Project</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th><Th right>Discount</Th>{can('payments', 'delete') && <Th />}</tr></thead>
            <tbody>
              {supplier.length === 0 && <EmptyRow cols={10} />}
              {supplier.map(({ p, inv }) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <Td className="font-mono text-xs">{p.id}</Td><Td className="whitespace-nowrap">{formatDate(p.date)}</Td>
                  <Td><Link to={`/suppliers/${inv.supplierId}`} className="hover:text-blue-600">{db.suppliers.find((x) => x.id === inv.supplierId)?.name}</Link></Td>
                  <Td>{inv.invoiceNumber}</Td><Td>{db.projects.find((x) => x.id === inv.projectId)?.shortName}</Td><Td>{p.method}</Td><Td className="text-slate-500">{p.reference}</Td>
                  <Td right><Money value={p.amount} className="font-medium" /></Td>
                  <Td right>{p.discount ? <Money value={p.discount} className="text-emerald-700" /> : <span className="text-slate-300">—</span>}</Td>
                  {can('payments', 'delete') && <Td><IconAction title="Cancel payment" tone="red" onClick={() => { const r = askReason(`supplier payment ${p.id} of ${formatINR(p.amount)}`); if (r) void run('cancelSupplierPayment', [p.id, r], { success: `${p.id} cancelled` }) }}><Ban size={14} /></IconAction></Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ClientPaymentForm open={modal === 'client'} onClose={() => setModal(null)} projectId={project || undefined} />
      <SupplierPaymentForm open={modal === 'supplier'} onClose={() => setModal(null)} />
    </>
  )
}
