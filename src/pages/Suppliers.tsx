import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Mail, MapPin, Phone, Plus, User } from 'lucide-react'
import { ExpenseForm, SupplierPaymentForm } from '../components/forms'
import { SupplierInvoiceTable } from '../components/tables'
import { Button, Card, EmptyRow, FilterBar, Kpi, KpiGrid, Money, PageHeader, Select, Table, Td, Th } from '../components/ui'
import { supplierFinancials, supplierInvoiceView } from '../lib/calc'
import { formatCompact, formatDate, formatINR } from '../lib/format'
import { useStore } from '../store/store'

export function Suppliers() {
  const { db } = useStore()
  const [status, setStatus] = useState('')
  const [project, setProject] = useState('')
  const [pay, setPay] = useState<string | undefined>()
  const [payOpen, setPayOpen] = useState(false)
  const rows = db.suppliers.map((s) => ({ s, f: supplierFinancials(db, s.id) }))
  const all = db.supplierInvoices.map((i) => supplierInvoiceView(db, i))
  const views = all
    .filter((v) => !status || v.status === status)
    .filter((v) => !project || v.projectId === project)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
  const t = rows.reduce((a, { f }) => ({ inv: a.inv + f.invoiced, paid: a.paid + f.paid, pending: a.pending + f.pending, overdue: a.overdue + f.overdue }), { inv: 0, paid: 0, pending: 0, overdue: 0 })

  return (
    <>
      <PageHeader title="Suppliers" subtitle="Supplier invoices (payables) and payments. Expense ≠ payment." actions={<Button variant="primary" onClick={() => { setPay(undefined); setPayOpen(true) }}>Record supplier payment</Button>} />
      <KpiGrid cols={4}>
        <Kpi label="Total invoiced" value={formatCompact(t.inv)} sub={`${all.length} invoices`} />
        <Kpi label="Total paid" value={formatCompact(t.paid)} tone="positive" sub={`${db.supplierPayments.length} payments`} />
        <Kpi label="Pending" value={formatCompact(t.pending)} tone="warning" />
        <Kpi label="Overdue" value={formatCompact(t.overdue)} tone="negative" sub={`${all.filter((v) => v.status === 'Overdue').length} invoices past due`} />
      </KpiGrid>
      <Card className="mt-5" title="Supplier accounts" bodyClassName="">
        <Table>
          <thead><tr><Th>Supplier</Th><Th>Category</Th><Th>Contact</Th><Th right>Total invoiced</Th><Th right>Total paid</Th><Th right>Pending</Th><Th right>Overdue</Th></tr></thead>
          <tbody>
            {rows.map(({ s, f }) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <Td><Link to={`/suppliers/${s.id}`} className="font-medium text-navy-900 hover:text-blue-600">{s.name}</Link><div className="text-xs text-slate-400">{s.id} · {s.city}</div></Td>
                <Td>{s.category}</Td>
                <Td><div>{s.contactPerson}</div><div className="text-xs text-slate-400">{s.phone}</div></Td>
                <Td right><Money value={f.invoiced} /></Td>
                <Td right><Money value={f.paid} className="text-emerald-700" /></Td>
                <Td right><Money value={f.pending} className={f.pending ? 'font-medium text-amber-700' : 'text-slate-400'} /></Td>
                <Td right><Money value={f.overdue} className={f.overdue ? 'font-semibold text-red-600' : 'text-slate-400'} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-5" title="Supplier invoices" subtitle="Expand a row to see invoice lines and payment history." bodyClassName="">
        <FilterBar>
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['Unpaid', 'Partially Paid', 'Paid', 'Overdue'].map((s) => <option key={s}>{s}</option>)}</Select>
          <Select className="w-52" value={project} onChange={(e) => setProject(e.target.value)}><option value="">All projects</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select>
        </FilterBar>
        <SupplierInvoiceTable views={views} onPay={(id) => { setPay(id); setPayOpen(true) }} />
      </Card>
      <SupplierPaymentForm open={payOpen} onClose={() => setPayOpen(false)} supplierInvoiceId={pay} />
    </>
  )
}

export function SupplierDetail() {
  const { id } = useParams()
  const { db } = useStore()
  const [modal, setModal] = useState<null | 'pay' | 'invoice'>(null)
  const [pay, setPay] = useState<string | undefined>()
  const s = db.suppliers.find((x) => x.id === id)
  if (!s) return <PageHeader title="Supplier not found" crumbs={[{ label: 'Suppliers', to: '/suppliers' }]} />
  const f = supplierFinancials(db, s.id)
  const payments = db.supplierPayments.filter((p) => f.invoices.some((i) => i.id === p.supplierInvoiceId)).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <PageHeader title={s.name} subtitle={`${s.id} · ${s.category}`} crumbs={[{ label: 'Suppliers', to: '/suppliers' }, { label: s.name }]}
        actions={<><Button icon={<Plus size={15} />} onClick={() => setModal('invoice')}>New supplier invoice</Button><Button variant="primary" disabled={f.pending <= 0} onClick={() => { setPay(undefined); setModal('pay') }}>Record payment</Button></>} />
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card title="Supplier information">
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-2.5"><User size={16} className="text-slate-400" />{s.contactPerson}</li>
            <li className="flex gap-2.5"><Phone size={16} className="text-slate-400" />{s.phone}</li>
            <li className="flex gap-2.5"><Mail size={16} className="text-slate-400" />{s.email}</li>
            <li className="flex gap-2.5"><MapPin size={16} className="text-slate-400" />{s.city}</li>
          </ul>
        </Card>
        <KpiGrid cols={4}>
          <Kpi label="Total invoiced" value={formatINR(f.invoiced)} sub={`${f.invoices.length} invoices`} />
          <Kpi label="Total paid" value={formatINR(f.paid)} tone="positive" />
          <Kpi label="Pending amount" value={formatINR(f.pending)} tone="warning" />
          <Kpi label="Overdue amount" value={formatINR(f.overdue)} tone={f.overdue ? 'negative' : 'neutral'} />
        </KpiGrid>
      </div>
      <Card className="mt-5" title="Invoices" bodyClassName="">
        <SupplierInvoiceTable views={f.invoices} showSupplier={false} onPay={(iid) => { setPay(iid); setModal('pay') }} />
      </Card>
      <Card className="mt-5" title="Payment history" bodyClassName="">
        <Table>
          <thead><tr><Th>Payment</Th><Th>Date</Th><Th>Invoice</Th><Th>Project</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th></tr></thead>
          <tbody>
            {payments.length === 0 && <EmptyRow cols={7} />}
            {payments.map((p) => {
              const inv = f.invoices.find((i) => i.id === p.supplierInvoiceId)!
              return (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.id}</Td><Td>{formatDate(p.date)}</Td><Td>{inv.invoiceNumber}</Td>
                  <Td>{db.projects.find((x) => x.id === inv.projectId)?.shortName}</Td><Td>{p.method}</Td><Td className="text-slate-500">{p.reference}</Td>
                  <Td right><Money value={p.amount} /></Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
      <SupplierPaymentForm open={modal === 'pay'} onClose={() => setModal(null)} supplierId={s.id} supplierInvoiceId={pay} />
      <ExpenseForm open={modal === 'invoice'} onClose={() => setModal(null)} defaults={{ supplierId: s.id, category: s.category === 'Outsource Contractor' || s.category === 'Equipment Rental' ? 'outsource' : 'material' }} />
    </>
  )
}
