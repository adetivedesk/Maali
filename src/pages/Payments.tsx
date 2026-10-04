import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClientPaymentForm, SupplierPaymentForm } from '../components/forms'
import { Button, Card, EmptyRow, FilterBar, Kpi, KpiGrid, Money, PageHeader, Select, Table, Tabs, Td, Th } from '../components/ui'
import { PAYMENT_METHODS } from '../data/types'
import { formatCompact, formatDate } from '../lib/format'
import { useStore } from '../store/store'

type Tab = 'client' | 'supplier'

export function Payments() {
  const { db } = useStore()
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

  return (
    <>
      <PageHeader title="Payments" subtitle="Money in from clients and money out to suppliers."
        actions={<><Button onClick={() => setModal('supplier')}>Record supplier payment</Button><Button variant="primary" onClick={() => setModal('client')}>Record client payment</Button></>} />
      <KpiGrid cols={3}>
        <Kpi label="Client receipts" value={formatCompact(inflow)} tone="positive" sub={`${client.length} payments`} />
        <Kpi label="Supplier payments" value={formatCompact(outflow)} tone="warning" sub={`${supplier.length} payments`} />
        <Kpi label="Net (receipts − supplier payments)" value={formatCompact(inflow - outflow)} tone={inflow - outflow >= 0 ? 'positive' : 'negative'} sub="excludes own labour paid at site" />
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
            <thead><tr><Th>Payment</Th><Th>Date</Th><Th>Invoice</Th><Th>Project</Th><Th>Phase</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th></tr></thead>
            <tbody>
              {client.length === 0 && <EmptyRow cols={8} />}
              {client.map(({ p, inv }) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <Td className="font-mono text-xs">{p.id}</Td><Td className="whitespace-nowrap">{formatDate(p.date)}</Td><Td className="font-medium">{inv.invoiceNumber}</Td>
                  <Td><Link to={`/projects/${inv.projectId}`} className="hover:text-blue-600">{db.projects.find((x) => x.id === inv.projectId)?.shortName}</Link></Td>
                  <Td>{db.phases.find((x) => x.id === inv.phaseId)?.name}</Td><Td>{p.method}</Td><Td className="text-slate-500">{p.reference}</Td>
                  <Td right><Money value={p.amount} className="font-medium text-emerald-700" /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead><tr><Th>Payment</Th><Th>Date</Th><Th>Supplier</Th><Th>Invoice</Th><Th>Project</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th></tr></thead>
            <tbody>
              {supplier.length === 0 && <EmptyRow cols={8} />}
              {supplier.map(({ p, inv }) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <Td className="font-mono text-xs">{p.id}</Td><Td className="whitespace-nowrap">{formatDate(p.date)}</Td>
                  <Td><Link to={`/suppliers/${inv.supplierId}`} className="hover:text-blue-600">{db.suppliers.find((x) => x.id === inv.supplierId)?.name}</Link></Td>
                  <Td>{inv.invoiceNumber}</Td><Td>{db.projects.find((x) => x.id === inv.projectId)?.shortName}</Td><Td>{p.method}</Td><Td className="text-slate-500">{p.reference}</Td>
                  <Td right><Money value={p.amount} className="font-medium" /></Td>
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
