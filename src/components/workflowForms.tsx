import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FileUp, Plus, Trash2, XCircle } from 'lucide-react'
import type { CostCategory, DocumentEntity, DocumentType, PhaseBudget } from '../data/types'
import { PROJECT_MANAGERS } from '../data/catalog'
import { COST_CATEGORIES, COST_LABEL, canCloseProject, quotationTotals } from '../lib/calc'
import { addDays, formatINR, formatPct, today } from '../lib/format'
import * as A from '../store/actions'
import { useStore } from '../store/store'
import { Button, Callout, Field, Input, Modal, NumberInput, Select, Stat, Textarea } from './ui'

const num = (v: number | '') => (v === '' ? 0 : v)

// =============================================================================
// Client
// =============================================================================

export function ClientForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const { db, commit } = useStore()
  const blank = { name: '', contactPerson: '', phone: '', email: '', city: '', state: 'Tamil Nadu' }
  const [f, setF] = useState(blank)
  useEffect(() => { if (open) setF(blank) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const valid = f.name.trim() && f.contactPerson.trim()
  function save() {
    const [next, c] = A.addClient(db, f)
    commit(next, `Client ${c.id} created`)
    onCreated?.(c.id)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="New Client" width="max-w-xl"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Create client</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company name" className="sm:col-span-2"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Contact person"><Input value={f.contactPerson} onChange={set('contactPerson')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} placeholder="+91" /></Field>
        <Field label="Email" className="sm:col-span-2"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="State"><Input value={f.state} onChange={set('state')} /></Field>
      </div>
    </Modal>
  )
}

// =============================================================================
// Quotation
// =============================================================================

interface ItemRow { description: string; amount: number | ''; estimatedCost: number | '' }

export function QuotationForm({ open, onClose, clientId: cDefault }: { open: boolean; onClose: () => void; clientId?: string }) {
  const { db, commit } = useStore()
  const navigate = useNavigate()
  const [clientId, setClientId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [location, setLocation] = useState('')
  const [quoteDate, setQuoteDate] = useState(today())
  const [validUntil, setValidUntil] = useState(addDays(today(), 30))
  const [items, setItems] = useState<ItemRow[]>([])
  const [newClient, setNewClient] = useState(false)

  useEffect(() => {
    if (!open) return
    setClientId(cDefault ?? db.clients[0]?.id ?? '')
    setProjectName(''); setLocation(''); setQuoteDate(today()); setValidUntil(addDays(today(), 30))
    setItems([{ description: 'Foundation', amount: '', estimatedCost: '' }, { description: 'Structure', amount: '', estimatedCost: '' }, { description: 'Finishing', amount: '', estimatedCost: '' }])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = items.reduce((a, i) => a + num(i.amount), 0)
  const cost = items.reduce((a, i) => a + num(i.estimatedCost), 0)
  const valid = clientId && projectName.trim() && items.length > 0 && items.every((i) => i.description.trim() && num(i.amount) > 0)
  const upd = (idx: number, patch: Partial<ItemRow>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  function save(status: 'Draft' | 'Sent') {
    const client = db.clients.find((c) => c.id === clientId)
    const [next, q] = A.addQuotation(db, { clientId, projectName, location: location || `${client?.city}, ${client?.state}`, quoteDate, validUntil, status },
      items.map((i) => ({ description: i.description, amount: num(i.amount), estimatedCost: num(i.estimatedCost) })))
    commit(next, `${q.id} saved as ${status}`)
    onClose()
    navigate(`/quotations/${q.id}`)
  }

  return (
    <>
      <Modal open={open && !newClient} onClose={onClose} width="max-w-3xl" title="New Quotation" subtitle="Each line item becomes a project phase when the quote is converted."
        footer={<><Button onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => save('Draft')}>Save draft</Button><Button variant="primary" disabled={!valid} onClick={() => save('Sent')}>Save & mark sent</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Client">
            <div className="flex gap-2">
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {db.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Button onClick={() => setNewClient(true)} icon={<Plus size={14} />}>New</Button>
            </div>
          </Field>
          <Field label="Project name"><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Lakeview Apartments – Trichy" /></Field>
          <Field label="Site location"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Quote date"><Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} /></Field>
            <Field label="Valid until"><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2 text-left">Scope / phase</th><th className="w-40 px-3 py-2 text-right">Quote value (₹)</th><th className="w-40 px-3 py-2 text-right">Est. cost (₹)</th><th className="w-28 px-3 py-2 text-right">Margin</th><th className="w-10" /></tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const m = num(it.amount) ? ((num(it.amount) - num(it.estimatedCost)) / num(it.amount)) * 100 : 0
                return (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5"><Input value={it.description} onChange={(e) => upd(i, { description: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><NumberInput className="text-right" value={it.amount} onChange={(v) => upd(i, { amount: v })} /></td>
                    <td className="px-2 py-1.5"><NumberInput className="text-right" value={it.estimatedCost} onChange={(v) => upd(i, { estimatedCost: v })} /></td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">{num(it.amount) ? formatPct(m) : '—'}</td>
                    <td className="px-1"><button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td className="px-3 py-2"><Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setItems([...items, { description: '', amount: '', estimatedCost: '' }])}>Add line</Button></td>
                <td className="num px-3 py-2 text-right">{formatINR(total)}</td>
                <td className="num px-3 py-2 text-right">{formatINR(cost)}</td>
                <td className="num px-3 py-2 text-right text-emerald-700">{total ? formatPct(((total - cost) / total) * 100) : '—'}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-3 text-right text-sm text-slate-600">Expected profit: <b className="num text-emerald-700">{formatINR(total - cost)}</b></div>
      </Modal>
      <ClientForm open={open && newClient} onClose={() => setNewClient(false)} onCreated={setClientId} />
    </>
  )
}

export function ConvertQuoteForm({ open, onClose, quotationId }: { open: boolean; onClose: () => void; quotationId: string }) {
  const { db, commit } = useStore()
  const navigate = useNavigate()
  const q = db.quotations.find((x) => x.id === quotationId)
  const [pm, setPm] = useState(PROJECT_MANAGERS[0])
  const [startDate, setStartDate] = useState(addDays(today(), 14))
  const [endDate, setEndDate] = useState(addDays(today(), 194))
  if (!q) return null
  const t = quotationTotals(db, quotationId)
  function save() {
    const [next, project] = A.convertQuotation(db, quotationId, { projectManager: pm, startDate, endDate })
    commit(next, `${project.id} created from ${quotationId}`)
    onClose()
    navigate(`/projects/${project.id}`)
  }
  return (
    <Modal open={open} onClose={onClose} title={`Convert ${q.id} → Project`} subtitle={q.projectName}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="success" onClick={save}>Create project</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Project manager"><Select value={pm} onChange={(e) => setPm(e.target.value)}>{PROJECT_MANAGERS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Start date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Expected completion"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Phases to be created</div>
        <div className="px-4">
          {t.items.map((i, n) => <Stat key={i.id} label={`${n + 1}. ${i.description}`}>{formatINR(i.amount)} <span className="ml-2 text-xs text-slate-400">budget {formatINR(i.estimatedCost)}</span></Stat>)}
          <Stat label="Contract value" strong>{formatINR(t.value)}</Stat>
        </div>
      </div>
      <div className="mt-3"><Callout>The project starts as <b>Contract Pending</b>. Upload the signed contract to activate it.</Callout></div>
    </Modal>
  )
}

// =============================================================================
// Contract upload (simulated)
// =============================================================================

export function ContractUploadForm({ open, onClose, contractId }: { open: boolean; onClose: () => void; contractId: string }) {
  const { db, commit } = useStore()
  const c = db.contracts.find((x) => x.id === contractId)
  const project = db.projects.find((p) => p.id === c?.projectId)
  const [fileName, setFileName] = useState('')
  const [signedDate, setSignedDate] = useState(today())
  useEffect(() => {
    if (open && project) { setFileName(`${project.shortName.replace(/\W+/g, '_')}_Signed_Contract.pdf`); setSignedDate(today()) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || !project) return null
  function save() {
    commit(A.uploadSignedContract(db, contractId, fileName, signedDate), `Signed contract uploaded — ${project!.shortName} is now Active`)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Upload Signed Contract" subtitle={`${c.id} · ${project.name}`} width="max-w-lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!fileName} onClick={save}>Upload & activate</Button></>}>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-blue-400 hover:bg-blue-50/40">
        <FileUp className="text-slate-400" size={28} />
        <span className="text-sm font-medium text-slate-700">{fileName || 'Choose file'}</span>
        <span className="text-xs text-slate-400">PDF up to 20 MB · demo: file is not actually stored</span>
        <input type="file" className="hidden" accept=".pdf" onChange={(e) => e.target.files?.[0] && setFileName(e.target.files[0].name)} />
      </label>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Signed date"><Input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} /></Field>
        <Field label="Contract value"><Input disabled value={formatINR(c.value)} /></Field>
      </div>
    </Modal>
  )
}

// =============================================================================
// Phase create / budget
// =============================================================================

export function PhaseForm({ open, onClose, projectId, phaseId }: { open: boolean; onClose: () => void; projectId: string; phaseId?: string }) {
  const { db, commit } = useStore()
  const existing = db.phases.find((p) => p.id === phaseId)
  const [name, setName] = useState('')
  const [contractValue, setContractValue] = useState<number | ''>('')
  const [budget, setBudget] = useState<Record<CostCategory, number | ''>>({ material: '', labour: '', outsource: '', other: '' })
  useEffect(() => {
    if (!open) return
    setName(existing?.name ?? '')
    setContractValue(existing?.contractValue ?? '')
    setBudget(existing ? { ...existing.budget } : { material: '', labour: '', outsource: '', other: '' })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const planned = COST_CATEGORIES.reduce((a, k) => a + num(budget[k]), 0)
  const valid = name.trim() && num(contractValue) > 0
  const coLinked = !!existing?.changeOrderId
  function save() {
    const b = Object.fromEntries(COST_CATEGORIES.map((k) => [k, num(budget[k])])) as PhaseBudget
    if (existing) commit(A.setPhaseBudget(db, existing.id, b, coLinked ? undefined : num(contractValue)), `Budget updated for ${existing.name}`)
    else {
      const [next, ph] = A.addPhase(db, { projectId, name, contractValue: num(contractValue), budget: b })
      commit(next, `Phase ${ph.id} created`)
    }
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={existing ? `Set Phase Budget — ${existing.name}` : 'Add Phase'} width="max-w-xl"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phase name"><Input value={name} disabled={!!existing} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phase contract value (₹)" hint={coLinked ? 'Set by change order' : undefined}><NumberInput value={contractValue} disabled={coLinked} onChange={setContractValue} /></Field>
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Planned cost (budget)</div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COST_CATEGORIES.map((k) => (
          <Field key={k} label={`${COST_LABEL[k]} (₹)`}><NumberInput value={budget[k]} onChange={(v) => setBudget({ ...budget, [k]: v })} /></Field>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 px-4 py-1">
        <Stat label="Total planned cost">{formatINR(planned)}</Stat>
        <Stat label="Expected profit" strong><span className={num(contractValue) - planned >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatINR(num(contractValue) - planned)} ({num(contractValue) ? formatPct(((num(contractValue) - planned) / num(contractValue)) * 100) : '—'})</span></Stat>
      </div>
      {!existing && db.projects.find((p) => p.id === projectId)?.status !== 'Contract Pending' && (
        <div className="mt-3"><Callout tone="warning">Adding a phase does not change the signed contract value. Use a <b>Change Order</b> for additional client-approved work.</Callout></div>
      )}
    </Modal>
  )
}

// =============================================================================
// Change order
// =============================================================================

export function ChangeOrderForm({ open, onClose, projectId: pDefault }: { open: boolean; onClose: () => void; projectId?: string }) {
  const { db, commit } = useStore()
  const projects = db.projects.filter((p) => ['Active', 'On Hold', 'Completed'].includes(p.status))
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [revenue, setRevenue] = useState<number | ''>('')
  const [estimatedCost, setEstimatedCost] = useState<number | ''>('')
  const [approved, setApproved] = useState(true)
  useEffect(() => {
    if (!open) return
    setProjectId(pDefault ?? projects[0]?.id ?? ''); setDescription(''); setRevenue(''); setEstimatedCost(''); setApproved(true)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = projectId && description.trim() && num(revenue) > 0
  function save() {
    let [next, co] = A.addChangeOrder(db, { projectId, description, date: today(), revenue: num(revenue), estimatedCost: num(estimatedCost) })
    if (approved) next = A.approveChangeOrder(next, co.id)
    commit(next, `${co.number} ${approved ? 'approved — project revenue updated' : 'created (pending approval)'}`)
    onClose()
  }
  const p = db.projects.find((x) => x.id === projectId)
  return (
    <Modal open={open} onClose={onClose} title="New Change Order" subtitle="Additional work after the original contract." width="max-w-xl"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Save change order</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Project" className="sm:col-span-2"><Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Additional compound wall construction" /></Field>
        <Field label="Additional revenue (₹)"><NumberInput value={revenue} onChange={setRevenue} /></Field>
        <Field label="Estimated cost (₹)"><NumberInput value={estimatedCost} onChange={setEstimatedCost} /></Field>
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 px-4 py-1">
        <Stat label="Expected additional profit"><span className="text-emerald-700">{formatINR(num(revenue) - num(estimatedCost))}</span></Stat>
        {p && <Stat label="Original contract">{formatINR(p.contractValue)}</Stat>}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Client has approved — add revenue and create a phase to track its cost
      </label>
    </Modal>
  )
}

// =============================================================================
// Document upload (simulated)
// =============================================================================

const DOC_TYPES: DocumentType[] = ['Quotation', 'Signed Contract', 'BOQ', 'Supplier Invoice', 'Client Invoice', 'Payment Receipt', 'Project Report', 'Site Photo']

export function DocumentUploadForm({ open, onClose, projectId: pDefault }: { open: boolean; onClose: () => void; projectId?: string }) {
  const { db, commit } = useStore()
  const [fileName, setFileName] = useState('')
  const [type, setType] = useState<DocumentType>('Site Photo')
  const [projectId, setProjectId] = useState('')
  const [entityType, setEntityType] = useState<DocumentEntity>('Project')
  const [entityId, setEntityId] = useState('')
  useEffect(() => { if (open) { setFileName(''); setProjectId(pDefault ?? db.projects[0]?.id ?? ''); setEntityType('Project'); setEntityId('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const options: { id: string; label: string }[] =
    entityType === 'Project' ? [{ id: projectId, label: db.projects.find((p) => p.id === projectId)?.name ?? projectId }]
      : entityType === 'Phase' ? db.phases.filter((p) => p.projectId === projectId).map((p) => ({ id: p.id, label: `${p.id} · ${p.name}` }))
        : entityType === 'Quotation' ? db.quotations.map((q) => ({ id: q.id, label: `${q.id} · ${q.projectName}` }))
          : entityType === 'Contract' ? db.contracts.filter((c) => c.projectId === projectId).map((c) => ({ id: c.id, label: c.id }))
            : entityType === 'Invoice' ? db.clientInvoices.filter((i) => i.projectId === projectId).map((i) => ({ id: i.id, label: `${i.invoiceNumber} · ${i.description}` }))
              : entityType === 'Expense' ? db.expenses.filter((e) => e.projectId === projectId).map((e) => ({ id: e.id, label: `${e.id} · ${e.description}` }))
                : db.suppliers.map((s) => ({ id: s.id, label: s.name }))
  const effectiveEntity = entityId && options.some((o) => o.id === entityId) ? entityId : options[0]?.id ?? ''

  function save() {
    const [next, doc] = A.addDocument(db, { name: fileName, type, entityType, entityId: effectiveEntity, projectId: projectId || undefined, uploadedBy: 'Admin', sizeKb: 200 + Math.round(Math.random() * 3000) })
    commit(next, `${doc.name} uploaded`)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Upload Document" width="max-w-lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!fileName || !effectiveEntity} onClick={save}>Upload</Button></>}>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center hover:border-blue-400">
        <FileUp className="text-slate-400" size={26} />
        <span className="text-sm font-medium text-slate-700">{fileName || 'Choose a file'}</span>
        <span className="text-xs text-slate-400">Simulated upload — only metadata is stored</span>
        <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && setFileName(e.target.files[0].name)} />
      </label>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Document type"><Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Project"><Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select></Field>
        <Field label="Linked to"><Select value={entityType} onChange={(e) => { setEntityType(e.target.value as DocumentEntity); setEntityId('') }}>{(['Project', 'Phase', 'Quotation', 'Contract', 'Invoice', 'Expense', 'Supplier'] as DocumentEntity[]).map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Record"><Select value={effectiveEntity} onChange={(e) => setEntityId(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></Field>
      </div>
    </Modal>
  )
}

// =============================================================================
// Project closure
// =============================================================================

export function CloseProjectDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { db, commit } = useStore()
  const navigate = useNavigate()
  const [notes, setNotes] = useState('')
  if (!open) return null
  const { checks, ready, financials: f } = canCloseProject(db, projectId)
  function close() {
    commit(A.closeProject(db, projectId, 'Admin', notes || undefined), `${f.project.shortName} closed`)
    onClose()
    navigate(`/reports/closure/${projectId}`)
  }
  return (
    <Modal open={open} onClose={onClose} title={`Close Project — ${f.project.name}`} subtitle="Review the closure checklist. Final figures are snapshotted on closure."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ready} onClick={close}>Close project & view report</Button></>}>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-sm">
            {c.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
            <span className={c.ok ? 'text-slate-700' : 'font-medium text-red-700'}>{c.label}</span>
            {c.note && <span className="text-xs text-slate-400">· {c.note}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-1 gap-x-4 rounded-xl bg-slate-50 px-4 py-2 sm:grid-cols-2">
        <div>
          <Stat label="Final revenue">{formatINR(f.revenue)}</Stat>
          <Stat label="Final cost">{formatINR(f.actual.total)}</Stat>
          <Stat label="Final profit" strong><span className="text-emerald-700">{formatINR(f.actualProfit)}</span></Stat>
        </div>
        <div>
          <Stat label="Client pending"><span className={f.clientPending ? 'text-red-600' : ''}>{formatINR(f.clientPending)}</span></Stat>
          <Stat label="Supplier pending"><span className={f.supplierPending ? 'text-red-600' : ''}>{formatINR(f.supplierPending)}</span></Stat>
          <Stat label="Profit margin" strong>{formatPct(f.actualMargin)}</Stat>
        </div>
      </div>
      {!ready && <div className="mt-3"><Callout tone="danger">Resolve the failed checks before closing — complete all phases and bill the full contract value.</Callout></div>}
      <Field label="Closure notes" className="mt-4"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
    </Modal>
  )
}
