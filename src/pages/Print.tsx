import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Client } from '../data/types'
import { clientInvoicePaid, phaseBilling, quotationTotals } from '../lib/calc'
import { formatDate, formatINR } from '../lib/format'
import type { MenuKey } from '../lib/permissions'
import { useStore } from '../store/store'

// Printable documents (no GST in the pilot). Rendered outside the app layout on
// an A4-width sheet; the browser's Print → "Save as PDF" produces the PDF.

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100
  const t = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`
  return [h ? `${ONES[h]} Hundred` : '', t].filter(Boolean).join(' ')
}

/** 1234567 → "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only" (Indian grouping). */
export function amountInWords(amount: number): string {
  let n = Math.round(Math.abs(amount))
  if (n === 0) return 'Rupees Zero Only'
  const parts: string[] = []
  const crore = Math.floor(n / 1e7); n %= 1e7
  const lakh = Math.floor(n / 1e5); n %= 1e5
  const thousand = Math.floor(n / 1e3); n %= 1e3
  if (crore) parts.push(`${crore >= 1000 ? amountInWords(crore).replace(/^Rupees | Only$/g, '') : below1000(crore)} Crore`)
  if (lakh) parts.push(`${below1000(lakh)} Lakh`)
  if (thousand) parts.push(`${below1000(thousand)} Thousand`)
  if (n) parts.push(below1000(n))
  return `Rupees ${parts.join(' ')} Only`
}

function Sheet({ title, number, date, back, menu, children }: { title: string; number: string; date: string; back: string; menu: MenuKey; children: ReactNode }) {
  const { settings: s, can } = useStore()
  useEffect(() => { document.title = `${number} · ${title}` }, [number, title])
  if (!can(menu)) return <div className="p-10 text-center text-sm text-slate-500">You do not have access to this document.</div>
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Link to={back} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={15} /> Back</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-navy-800"><Printer size={15} /> Print / Save as PDF</button>
      </div>
      <article className="mx-auto min-h-[297mm] max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[13px] text-slate-800 shadow-lg print:min-h-0 print:shadow-none">
        <div className="flex items-start justify-between gap-6 border-b-2 border-navy-900 pb-4">
          <div>
            <div className="text-xl font-bold text-navy-900">{s.name}</div>
            {s.tagline && <div className="text-xs text-slate-500">{s.tagline}</div>}
            {s.address && <div className="mt-1 whitespace-pre-line text-xs">{s.address}</div>}
            <div className="text-xs">{[s.phone, s.email].filter(Boolean).join(' · ')}</div>
            {s.gstin && <div className="text-xs">GSTIN: {s.gstin}</div>}
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold uppercase tracking-wide text-navy-900">{title}</div>
            <div className="mt-1 font-mono text-sm">{number}</div>
            <div className="text-xs text-slate-500">Date: {formatDate(date)}</div>
          </div>
        </div>
        {children}
        <footer className="mt-12 flex items-end justify-between gap-6 text-xs">
          <div className="max-w-[60%] text-slate-500">
            {s.bankDetails && <div className="mb-2 whitespace-pre-line"><b className="text-slate-700">Bank details</b><br />{s.bankDetails}</div>}
            {s.footer}
          </div>
          <div className="text-center">
            <div className="h-12" />
            <div className="border-t border-slate-400 px-6 pt-1">For {s.name}<br />Authorised signatory</div>
          </div>
        </footer>
      </article>
    </div>
  )
}

function Party({ label, client, extra }: { label: string; client?: Client; extra?: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-navy-900">{client?.name ?? '—'}</div>
      {client && <div className="text-xs">Attn: {client.contactPerson}<br />{client.city}, {client.state}<br />{[client.phone, client.email].filter(Boolean).join(' · ')}</div>}
      {extra}
    </div>
  )
}

const th = 'border-b border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600'
const td = 'border-b border-slate-200 px-2 py-1.5 align-top'

function NotFound({ what }: { what: string }) {
  return <div className="p-10 text-center text-sm text-slate-500">{what} not found. <Link to="/" className="text-blue-600">Go to dashboard</Link></div>
}

export function PrintQuotation() {
  const { id } = useParams()
  const { db } = useStore()
  const q = db.quotations.find((x) => x.id === id)
  if (!q) return <NotFound what="Quotation" />
  const client = db.clients.find((c) => c.id === q.clientId)
  const { items, value } = quotationTotals(db, q.id)
  return (
    <Sheet title="Quotation" number={q.id} date={q.quoteDate} back={`/quotations/${q.id}`} menu="quotations">
      <div className="mt-5 grid grid-cols-2 gap-6">
        <Party label="To" client={client} />
        <div className="text-right text-xs">
          <div><b>Project:</b> {q.projectName}</div>
          <div><b>Location:</b> {q.location}</div>
          <div><b>Valid until:</b> {formatDate(q.validUntil)}</div>
        </div>
      </div>
      <table className="mt-6 w-full border-collapse">
        <thead><tr><th className={`${th} w-10`}>#</th><th className={th}>Description of work</th><th className={`${th} text-right`}>Amount (₹)</th></tr></thead>
        <tbody>
          {items.map((it, i) => <tr key={it.id}><td className={td}>{i + 1}</td><td className={td}>{it.description}</td><td className={`${td} num text-right`}>{formatINR(it.amount)}</td></tr>)}
          <tr><td className="px-2 py-2" /><td className="px-2 py-2 text-right font-semibold">Total</td><td className="num px-2 py-2 text-right text-base font-bold text-navy-900">{formatINR(value)}</td></tr>
        </tbody>
      </table>
      <div className="mt-1 text-xs italic">{amountInWords(value)}</div>
      <div className="mt-6 text-xs text-slate-600">
        <b className="text-slate-700">Terms</b>
        <ol className="mt-1 list-decimal pl-5">
          <li>Work will be executed and billed phase by phase as listed above.</li>
          <li>Any additional work will be taken up as a separate change order.</li>
          <li>This quotation is valid until {formatDate(q.validUntil)}.</li>
        </ol>
      </div>
    </Sheet>
  )
}

export function PrintInvoice() {
  const { id } = useParams()
  const { db } = useStore()
  const inv = db.clientInvoices.find((x) => x.id === id)
  if (!inv) return <NotFound what="Invoice" />
  const project = db.projects.find((p) => p.id === inv.projectId)
  const phase = db.phases.find((p) => p.id === inv.phaseId)
  const client = db.clients.find((c) => c.id === project?.clientId)
  const paid = clientInvoicePaid(db, inv.id)
  const billing = phase ? phaseBilling(db, phase.id) : null
  return (
    <Sheet title="Invoice" number={inv.invoiceNumber} date={inv.invoiceDate} back="/billing" menu="billing">
      <div className="mt-5 grid grid-cols-2 gap-6">
        <Party label="Bill to" client={client} />
        <div className="text-right text-xs">
          <div><b>Project:</b> {project?.name} ({project?.id})</div>
          <div><b>Location:</b> {project?.location}</div>
          <div><b>Due date:</b> {formatDate(inv.dueDate)}</div>
        </div>
      </div>
      <table className="mt-6 w-full border-collapse">
        <thead><tr><th className={th}>Description</th><th className={th}>Phase</th><th className={`${th} text-right`}>Amount (₹)</th></tr></thead>
        <tbody>
          <tr><td className={td}>{inv.description}</td><td className={td}>{phase?.name}</td><td className={`${td} num text-right`}>{formatINR(inv.amount)}</td></tr>
          <tr><td colSpan={2} className="px-2 py-2 text-right font-semibold">Amount payable</td><td className="num px-2 py-2 text-right text-base font-bold text-navy-900">{formatINR(inv.amount)}</td></tr>
        </tbody>
      </table>
      <div className="mt-1 text-xs italic">{amountInWords(inv.amount)}</div>
      {phase && billing && (
        <div className="mt-6 grid max-w-sm grid-cols-2 gap-x-4 gap-y-0.5 rounded border border-slate-200 p-3 text-xs">
          <div className="col-span-2 mb-1 font-semibold text-slate-700">Phase billing summary</div>
          <span>Phase value</span><span className="num text-right">{formatINR(phase.contractValue)}</span>
          <span>Billed to date (incl. this)</span><span className="num text-right">{formatINR(billing.billed)}</span>
          <span>Received to date</span><span className="num text-right">{formatINR(billing.received)}</span>
          <span>This invoice paid</span><span className="num text-right">{formatINR(paid)}</span>
        </div>
      )}
      <p className="mt-4 text-[11px] text-slate-500">GST is not charged on this invoice.</p>
    </Sheet>
  )
}

export function PrintReceipt() {
  const { id } = useParams()
  const { db } = useStore()
  const pay = db.clientPayments.find((x) => x.id === id)
  if (!pay) return <NotFound what="Payment" />
  const inv = db.clientInvoices.find((i) => i.id === pay.clientInvoiceId)
  const project = db.projects.find((p) => p.id === inv?.projectId)
  const client = db.clients.find((c) => c.id === project?.clientId)
  const paidToDate = inv ? clientInvoicePaid(db, inv.id) : 0
  return (
    <Sheet title="Payment Receipt" number={pay.id} date={pay.date} back="/payments" menu="payments">
      <div className="mt-5"><Party label="Received from" client={client} /></div>
      <p className="mt-6 leading-relaxed">
        Received with thanks the sum of <b>{formatINR(pay.amount)}</b> ({amountInWords(pay.amount)}) by <b>{pay.method}</b>
        {pay.reference && <> (ref. <span className="font-mono">{pay.reference}</span>)</>} towards invoice <b>{inv?.invoiceNumber}</b> — {inv?.description}, project {project?.name}.
      </p>
      {inv && (
        <div className="mt-6 grid max-w-sm grid-cols-2 gap-x-4 gap-y-0.5 rounded border border-slate-200 p-3 text-xs">
          <span>Invoice amount</span><span className="num text-right">{formatINR(inv.amount)}</span>
          <span>Received to date</span><span className="num text-right">{formatINR(paidToDate)}</span>
          <span className="font-semibold">Balance due</span><span className="num text-right font-semibold">{formatINR(inv.amount - paidToDate)}</span>
        </div>
      )}
    </Sheet>
  )
}
