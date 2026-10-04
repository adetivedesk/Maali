import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Calculator, HardHat, Package, Receipt, Truck } from 'lucide-react'
import type { CostCategory, OutsourceBasis, PaymentMethod } from '../data/types'
import { PAYMENT_METHODS } from '../data/types'
import { DEFAULT_DAILY_RATE, DEFAULT_MATERIAL_UNIT, EXPENSE_SUBTYPES, MATERIAL_UNITS, OUTSOURCE_UNITS } from '../data/catalog'
import {
  actualCost, clientInvoicePaid, phaseBilling, plannedCost, projectPhases, supplierInvoiceView,
} from '../lib/calc'
import { addDays, formatDate, formatINR, today } from '../lib/format'
import * as A from '../store/actions'
import { useStore } from '../store/store'
import { Button, Callout, Field, Input, Modal, NumberInput, Select, Stat } from './ui'

const num = (v: number | '') => (v === '' ? 0 : v)

/** Projects that can take transactions (not closed / cancelled). */
function useOpenProjects() {
  const { db } = useStore()
  return db.projects.filter((p) => !['Closed', 'Cancelled', 'Rejected'].includes(p.status))
}

// =============================================================================
// Expense entry — Project → Phase → Category → Cost type → Qty × Rate → Amount
// =============================================================================

const CATEGORY_TABS: { id: CostCategory; label: string; icon: typeof Package }[] = [
  { id: 'material', label: 'Material', icon: Package },
  { id: 'labour', label: 'Own Labour', icon: HardHat },
  { id: 'outsource', label: 'Outsource', icon: Truck },
  { id: 'other', label: 'Other Direct', icon: Receipt },
]

export interface ExpenseDefaults { projectId?: string; phaseId?: string; category?: CostCategory; supplierId?: string }

export function ExpenseForm({ open, onClose, defaults = {} }: { open: boolean; onClose: () => void; defaults?: ExpenseDefaults }) {
  const { db, commit } = useStore()
  const projects = useOpenProjects()

  const [projectId, setProjectId] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [category, setCategory] = useState<CostCategory>('material')
  const [subType, setSubType] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(today())
  const [quantity, setQuantity] = useState<number | ''>('')
  const [unit, setUnit] = useState('Bags')
  const [rate, setRate] = useState<number | ''>('')
  const [basis, setBasis] = useState<OutsourceBasis>('fixed')
  const [fixedAmount, setFixedAmount] = useState<number | ''>('')
  const [workerName, setWorkerName] = useState('')
  const [dailyRate, setDailyRate] = useState<number | ''>('')
  const [days, setDays] = useState<number | ''>('')
  const [otHours, setOtHours] = useState<number | ''>('')
  const [otherAmount, setOtherAmount] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState('')
  const [invoiceMode, setInvoiceMode] = useState<'new' | 'existing'>('new')
  const [existingInvoice, setExistingInvoice] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [dueDate, setDueDate] = useState(addDays(today(), 30))

  // Reset when opened
  useEffect(() => {
    if (!open) return
    const pid = defaults.projectId ?? projects[0]?.id ?? ''
    setProjectId(pid)
    setPhaseId(defaults.phaseId ?? projectPhases(db, pid).find((p) => p.status === 'In Progress')?.id ?? projectPhases(db, pid)[0]?.id ?? '')
    changeCategory(defaults.category ?? (defaults.supplierId ? 'material' : 'material'))
    setSupplierId(defaults.supplierId ?? '')
    setDescription(''); setQuantity(''); setRate(''); setFixedAmount(''); setWorkerName(''); setDays(''); setOtHours(''); setOtherAmount('')
    setInvoiceMode('new'); setExistingInvoice(''); setInvoiceNumber(''); setDate(today()); setInvoiceDate(today()); setDueDate(addDays(today(), 30))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function changeCategory(c: CostCategory) {
    setCategory(c)
    const st = EXPENSE_SUBTYPES[c][0]
    changeSubType(st, c)
    if (c === 'outsource') { setBasis('fixed'); setUnit('Sq.ft') }
  }
  function changeSubType(st: string, c = category) {
    setSubType(st)
    if (c === 'material') setUnit(DEFAULT_MATERIAL_UNIT[st] ?? 'Lot')
    if (c === 'labour') setDailyRate(DEFAULT_DAILY_RATE[st] ?? 1000)
  }

  const phases = projectPhases(db, projectId).filter((p) => p.status !== 'Closed')
  const phase = db.phases.find((p) => p.id === phaseId)
  const needsSupplier = category === 'material' || category === 'outsource'

  const amount =
    category === 'material' ? num(quantity) * num(rate)
      : category === 'labour' ? num(dailyRate) * num(days)
        : category === 'outsource' ? (basis === 'fixed' ? num(fixedAmount) : num(quantity) * num(rate))
          : num(otherAmount)

  const supplierOpenInvoices = useMemo(
    () => db.supplierInvoices.filter((i) => i.supplierId === supplierId && i.projectId === projectId).map((i) => supplierInvoiceView(db, i)),
    [db, supplierId, projectId],
  )

  const phaseActual = phase ? actualCost(db, phase.id) : null
  const phasePlanned = phase ? plannedCost(phase) : null
  const catAfter = phaseActual ? phaseActual[category] + amount : 0
  const catPlanned = phasePlanned ? phasePlanned[category] : 0

  const valid = projectId && phaseId && amount > 0 && (!needsSupplier || (supplierId && (invoiceMode === 'existing' ? existingInvoice : invoiceNumber)))
    && (category !== 'labour' || workerName.trim())

  function save() {
    if (!valid) return
    const base = { projectId, phaseId, category, subType, date }
    let input
    if (category === 'material') input = { ...base, description: description || subType, quantity: num(quantity), unit, rate: num(rate), amount, supplierId }
    else if (category === 'labour') input = { ...base, description: `${subType} — ${workerName}`, workerName, dailyRate: num(dailyRate), days: num(days), otHours: otHours === '' ? undefined : otHours, amount }
    else if (category === 'outsource') input = basis === 'fixed'
      ? { ...base, description: description || subType, basis, quantity: 1, unit: 'Fixed', rate: amount, amount, supplierId }
      : { ...base, description: description || subType, basis, quantity: num(quantity), unit, rate: num(rate), amount, supplierId }
    else input = { ...base, description: description || subType, amount }

    const inv: A.SupplierInvoiceInput = !needsSupplier ? { mode: 'none' }
      : invoiceMode === 'existing' ? { mode: 'existing', supplierInvoiceId: existingInvoice }
        : { mode: 'new', invoiceNumber, invoiceDate, dueDate }
    const [next, exp] = A.addExpense(db, input, inv)
    commit(next, `${exp.id} recorded · ${formatINR(amount)} to ${phase?.name}`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title="Record Expense"
      subtitle="Every cost is booked against Project → Phase so profitability updates instantly."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Save expense</Button></>}
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Project">
          <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPhaseId(projectPhases(db, e.target.value)[0]?.id ?? '') }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.shortName} ({p.id})</option>)}
          </Select>
        </Field>
        <Field label="Phase">
          <Select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.status}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => changeCategory(t.id)}
            className={clsx('flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition', category === t.id ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
          >
            <t.icon size={16} />{t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Field label={category === 'labour' ? 'Worker type' : 'Cost type'}>
          <Select value={subType} onChange={(e) => changeSubType(e.target.value)}>
            {EXPENSE_SUBTYPES[category].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        {category === 'labour' ? (
          <Field label="Worker name" className="col-span-2"><Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="e.g. Murugan" /></Field>
        ) : (
          <Field label="Description" className="col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={category === 'material' ? 'e.g. OPC 53 grade cement' : 'e.g. Painting outsource – exterior'} /></Field>
        )}
      </div>

      {/* Calculation block */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Calculator size={14} /> Cost calculation</div>

        {category === 'material' && (
          <div className="grid grid-cols-4 items-end gap-3">
            <Field label="Quantity"><NumberInput value={quantity} onChange={setQuantity} min={0} /></Field>
            <Field label="Unit"><Select value={unit} onChange={(e) => setUnit(e.target.value)}>{MATERIAL_UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
            <Field label="Unit rate (₹)"><NumberInput value={rate} onChange={setRate} min={0} /></Field>
            <CalcResult formula={`${num(quantity).toLocaleString('en-IN')} × ${formatINR(num(rate))}`} amount={amount} />
          </div>
        )}

        {category === 'labour' && (
          <div className="grid grid-cols-4 items-end gap-3">
            <Field label="Daily rate (₹)"><NumberInput value={dailyRate} onChange={setDailyRate} min={0} /></Field>
            <Field label="Working days"><NumberInput value={days} onChange={setDays} min={0} /></Field>
            <Field label="OT hours" hint="Optional · not costed yet"><NumberInput value={otHours} onChange={setOtHours} min={0} /></Field>
            <CalcResult formula={`${formatINR(num(dailyRate))} × ${num(days)} days`} amount={amount} />
          </div>
        )}

        {category === 'outsource' && (
          <>
            <div className="mb-3 inline-flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
              {(['fixed', 'rate'] as const).map((b) => (
                <button key={b} type="button" onClick={() => setBasis(b)} className={clsx('rounded-md px-3 py-1.5 text-xs font-medium', basis === b ? 'bg-navy-900 text-white' : 'text-slate-600')}>
                  {b === 'fixed' ? 'Fixed cost' : 'Quantity × Rate'}
                </button>
              ))}
            </div>
            {basis === 'fixed' ? (
              <div className="grid grid-cols-4 items-end gap-3">
                <Field label="Contract amount (₹)" className="col-span-2"><NumberInput value={fixedAmount} onChange={setFixedAmount} min={0} /></Field>
                <div />
                <CalcResult formula="Fixed contract" amount={amount} />
              </div>
            ) : (
              <div className="grid grid-cols-4 items-end gap-3">
                <Field label="Quantity / Area"><NumberInput value={quantity} onChange={setQuantity} min={0} /></Field>
                <Field label="Unit"><Select value={unit} onChange={(e) => setUnit(e.target.value)}>{OUTSOURCE_UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
                <Field label={`Rate (₹ / ${unit})`}><NumberInput value={rate} onChange={setRate} min={0} /></Field>
                <CalcResult formula={`${num(quantity).toLocaleString('en-IN')} ${unit} × ${formatINR(num(rate))}`} amount={amount} />
              </div>
            )}
          </>
        )}

        {category === 'other' && (
          <div className="grid grid-cols-4 items-end gap-3">
            <Field label="Amount (₹)" className="col-span-2"><NumberInput value={otherAmount} onChange={setOtherAmount} min={0} /></Field>
            <div />
            <CalcResult formula="Direct cost" amount={amount} />
          </div>
        )}
      </div>

      {needsSupplier && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier invoice (payable)</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier">
              <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setExistingInvoice('') }}>
                <option value="">Select supplier…</option>
                {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Invoice">
              <Select value={invoiceMode} onChange={(e) => setInvoiceMode(e.target.value as 'new' | 'existing')}>
                <option value="new">New supplier invoice</option>
                <option value="existing" disabled={!supplierOpenInvoices.length}>Add to existing invoice</option>
              </Select>
            </Field>
            {invoiceMode === 'existing' ? (
              <Field label="Existing invoice">
                <Select value={existingInvoice} onChange={(e) => setExistingInvoice(e.target.value)}>
                  <option value="">Select…</option>
                  {supplierOpenInvoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} · {formatINR(i.amount)} · {i.status}</option>)}
                </Select>
              </Field>
            ) : (
              <Field label="Supplier invoice no."><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. SLC/26/0520" /></Field>
            )}
          </div>
          {invoiceMode === 'new' && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Field label="Invoice date"><Input type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setDueDate(addDays(e.target.value, 30)) }} /></Field>
              <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              <Field label="Payment status"><Input disabled value="Unpaid — record payment in Suppliers" /></Field>
            </div>
          )}
        </div>
      )}

      {phase && amount > 0 && (
        <div className="mt-4">
          <Callout tone={catAfter > catPlanned ? 'warning' : 'info'}>
            After this entry, <b>{phase.name}</b> {category === 'labour' ? 'own labour' : category} cost will be <b>{formatINR(catAfter)}</b> against a budget of <b>{formatINR(catPlanned)}</b>
            {catAfter > catPlanned ? <> — <b>over budget by {formatINR(catAfter - catPlanned)}</b>.</> : '.'}
          </Callout>
        </div>
      )}
    </Modal>
  )
}

function CalcResult({ formula, amount }: { formula: string; amount: number }) {
  return (
    <div className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
      <div className="truncate text-[11px] text-slate-500">{formula} =</div>
      <div className="num text-lg font-semibold text-navy-900">{formatINR(amount)}</div>
    </div>
  )
}

// =============================================================================
// Supplier payment
// =============================================================================

export function SupplierPaymentForm({ open, onClose, supplierInvoiceId, supplierId }: { open: boolean; onClose: () => void; supplierInvoiceId?: string; supplierId?: string }) {
  const { db, commit } = useStore()
  const candidates = db.supplierInvoices
    .filter((i) => !supplierId || i.supplierId === supplierId)
    .map((i) => supplierInvoiceView(db, i))
    .filter((v) => v.pending > 0 || v.id === supplierInvoiceId)

  const [invId, setInvId] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer')
  const [reference, setReference] = useState('')

  useEffect(() => {
    if (!open) return
    const id = supplierInvoiceId ?? candidates[0]?.id ?? ''
    setInvId(id)
    setAmount(candidates.find((c) => c.id === id)?.pending ?? '')
    setDate(today()); setMethod('Bank Transfer'); setReference('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const inv = candidates.find((c) => c.id === invId)
  const supplier = db.suppliers.find((s) => s.id === inv?.supplierId)
  const valid = inv && num(amount) > 0 && num(amount) <= inv.pending

  function save() {
    if (!valid || !inv) return
    commit(A.addSupplierPayment(db, { supplierInvoiceId: inv.id, date, amount: num(amount), method, reference: reference || `${method === 'Cash' ? 'CASH' : 'NEFT'}/${date.replaceAll('-', '')}` }),
      `Payment of ${formatINR(num(amount))} recorded to ${supplier?.name}`)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Supplier Payment" subtitle="Expense ≠ payment — this reduces the supplier payable, not the project cost."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Record payment</Button></>}>
      {candidates.length === 0 ? <Callout tone="success">No pending supplier invoices.</Callout> : (
        <>
          <Field label="Supplier invoice">
            <Select value={invId} onChange={(e) => { setInvId(e.target.value); setAmount(candidates.find((c) => c.id === e.target.value)?.pending ?? '') }}>
              {candidates.map((c) => <option key={c.id} value={c.id}>{db.suppliers.find((s) => s.id === c.supplierId)?.name} · {c.invoiceNumber} · pending {formatINR(c.pending)}</option>)}
            </Select>
          </Field>
          {inv && (
            <div className="mt-3 grid grid-cols-4 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div><div className="text-xs text-slate-500">Invoice amount</div><div className="num font-semibold">{formatINR(inv.amount)}</div></div>
              <div><div className="text-xs text-slate-500">Paid so far</div><div className="num font-semibold text-emerald-700">{formatINR(inv.paid)}</div></div>
              <div><div className="text-xs text-slate-500">Pending</div><div className="num font-semibold text-red-600">{formatINR(inv.pending)}</div></div>
              <div><div className="text-xs text-slate-500">Due date</div><div className="font-semibold">{formatDate(inv.dueDate)}</div></div>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Amount (₹)" hint={inv && num(amount) > inv.pending ? <span className="text-red-600">Cannot exceed pending amount</span> : inv && `Balance after payment: ${formatINR(inv.pending - num(amount))}`}>
              <NumberInput value={amount} onChange={setAmount} min={0} />
            </Field>
            <Field label="Payment date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="Reference no."><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / Cheque no." /></Field>
          </div>
        </>
      )}
    </Modal>
  )
}

// =============================================================================
// Client invoice (phase billing)
// =============================================================================

export function ClientInvoiceForm({ open, onClose, projectId: pDefault, phaseId: phDefault }: { open: boolean; onClose: () => void; projectId?: string; phaseId?: string }) {
  const { db, commit } = useStore()
  const projects = useOpenProjects().filter((p) => p.status !== 'Contract Pending')
  const [projectId, setProjectId] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [description, setDescription] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [dueDate, setDueDate] = useState(addDays(today(), 15))

  const phaseInfo = (phId: string) => {
    const ph = db.phases.find((p) => p.id === phId)
    if (!ph) return null
    const { billed } = phaseBilling(db, phId)
    return { ph, billed, unbilled: ph.contractValue - billed }
  }

  function pickPhase(phId: string) {
    setPhaseId(phId)
    const info = phaseInfo(phId)
    if (!info) return
    const full = info.billed === 0
    setAmount(info.unbilled > 0 ? info.unbilled : '')
    setDescription(`${info.ph.name} — ${full ? 'final bill' : 'balance bill'}`)
  }

  useEffect(() => {
    if (!open) return
    const pid = pDefault ?? projects[0]?.id ?? ''
    setProjectId(pid)
    const first = phDefault ?? projectPhases(db, pid).find((p) => p.contractValue - phaseBilling(db, p.id).billed > 0 && p.status !== 'Planned')?.id ?? ''
    pickPhase(first)
    setInvoiceDate(today()); setDueDate(addDays(today(), 15))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const info = phaseInfo(phaseId)
  const billablePhases = projectPhases(db, projectId).filter((p) => p.contractValue - phaseBilling(db, p.id).billed > 0)
  const valid = info && num(amount) > 0 && num(amount) <= info.unbilled && description.trim()

  function save() {
    if (!valid) return
    const [next, inv] = A.addClientInvoice(db, { projectId, phaseId, description, invoiceDate, dueDate, amount: num(amount) })
    commit(next, `${inv.invoiceNumber} generated for ${formatINR(inv.amount)}`)
    onClose()
  }

  const pct = (p: number) => info && setAmount(Math.round((info.ph.contractValue * p) / 100))

  return (
    <Modal open={open} onClose={onClose} title="Generate Client Invoice" subtitle="Bill a phase in full or as a running bill (% of phase value)."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Generate invoice</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); pickPhase(projectPhases(db, e.target.value).find((p) => p.contractValue - phaseBilling(db, p.id).billed > 0)?.id ?? '') }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.shortName} ({p.id})</option>)}
          </Select>
        </Field>
        <Field label="Phase">
          <Select value={phaseId} onChange={(e) => pickPhase(e.target.value)}>
            <option value="">Select phase…</option>
            {billablePhases.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.status}</option>)}
          </Select>
        </Field>
      </div>
      {info && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><div className="text-xs text-slate-500">Phase contract value</div><div className="num font-semibold">{formatINR(info.ph.contractValue)}</div></div>
            <div><div className="text-xs text-slate-500">Already billed</div><div className="num font-semibold">{formatINR(info.billed)}</div></div>
            <div><div className="text-xs text-slate-500">Unbilled</div><div className="num font-semibold text-blue-700">{formatINR(info.unbilled)}</div></div>
          </div>
          {info.ph.status === 'Planned' && <div className="mt-3"><Callout tone="warning">This phase has not started. Billing it now would be an advance bill.</Callout></div>}
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-xs text-slate-500">Quick:</span>
            {[25, 30, 50].map((p) => <Button key={p} size="sm" onClick={() => pct(p)}>{p}% running bill</Button>)}
            <Button size="sm" onClick={() => setAmount(info.unbilled)}>Full balance</Button>
          </div>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Invoice amount (₹)" hint={info && num(amount) > info.unbilled ? <span className="text-red-600">Exceeds unbilled phase value</span> : undefined}>
          <NumberInput value={amount} onChange={setAmount} min={0} />
        </Field>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Invoice date"><Input type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setDueDate(addDays(e.target.value, 15)) }} /></Field>
        <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// =============================================================================
// Client payment
// =============================================================================

export function ClientPaymentForm({ open, onClose, invoiceId, projectId }: { open: boolean; onClose: () => void; invoiceId?: string; projectId?: string }) {
  const { db, commit } = useStore()
  const candidates = db.clientInvoices
    .filter((i) => !projectId || i.projectId === projectId)
    .map((i) => ({ inv: i, paid: clientInvoicePaid(db, i.id) }))
    .filter((x) => x.inv.amount - x.paid > 0 || x.inv.id === invoiceId)

  const [invId, setInvId] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer')
  const [reference, setReference] = useState('')

  useEffect(() => {
    if (!open) return
    const id = invoiceId ?? candidates[0]?.inv.id ?? ''
    setInvId(id)
    const c = candidates.find((x) => x.inv.id === id)
    setAmount(c ? c.inv.amount - c.paid : '')
    setDate(today()); setMethod('Bank Transfer'); setReference('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sel = candidates.find((x) => x.inv.id === invId)
  const pending = sel ? sel.inv.amount - sel.paid : 0
  const history = db.clientPayments.filter((p) => p.clientInvoiceId === invId)
  const valid = sel && num(amount) > 0 && num(amount) <= pending

  function save() {
    if (!valid || !sel) return
    commit(A.addClientPayment(db, { clientInvoiceId: sel.inv.id, date, amount: num(amount), method, reference: reference || `REF/${date.replaceAll('-', '')}` }),
      `Receipt of ${formatINR(num(amount))} recorded against ${sel.inv.invoiceNumber}`)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Client Payment" subtitle="Multiple payments can be recorded against one invoice."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Record receipt</Button></>}>
      {candidates.length === 0 ? <Callout tone="success">All client invoices are fully paid.</Callout> : (
        <>
          <Field label="Client invoice">
            <Select value={invId} onChange={(e) => { setInvId(e.target.value); const c = candidates.find((x) => x.inv.id === e.target.value); setAmount(c ? c.inv.amount - c.paid : '') }}>
              {candidates.map(({ inv, paid }) => (
                <option key={inv.id} value={inv.id}>{inv.invoiceNumber} · {db.projects.find((p) => p.id === inv.projectId)?.shortName} · pending {formatINR(inv.amount - paid)}</option>
              ))}
            </Select>
          </Field>
          {sel && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <Stat label="Invoice amount">{formatINR(sel.inv.amount)}</Stat>
              {history.map((h, i) => <Stat key={h.id} label={<span className="text-slate-500">Payment {i + 1} · {formatDate(h.date)} · {h.method}</span>}><span className="text-emerald-700">−{formatINR(h.amount)}</span></Stat>)}
              <Stat label="Balance" strong><span className="text-red-600">{formatINR(pending)}</span></Stat>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Amount received (₹)" hint={num(amount) > pending ? <span className="text-red-600">Cannot exceed balance</span> : `Balance after receipt: ${formatINR(pending - num(amount))}`}>
              <NumberInput value={amount} onChange={setAmount} min={0} />
            </Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="Reference no."><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / Cheque no." /></Field>
          </div>
        </>
      )}
    </Modal>
  )
}
