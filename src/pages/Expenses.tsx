import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { ExpenseForm } from '../components/forms'
import { ExpenseTable } from '../components/tables'
import { Button, Card, FilterBar, Input, Kpi, KpiGrid, PageHeader, Select } from '../components/ui'
import type { CostCategory } from '../data/types'
import { COST_CATEGORIES, COST_LABEL } from '../lib/calc'
import { formatCompact } from '../lib/format'
import { useStore } from '../store/store'

export function Expenses() {
  const { db } = useStore()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [project, setProject] = useState('')
  const [phase, setPhase] = useState('')
  const [category, setCategory] = useState<CostCategory | ''>('')
  const [supplier, setSupplier] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rows = db.expenses
    .filter((e) => !project || e.projectId === project)
    .filter((e) => !phase || e.phaseId === phase)
    .filter((e) => !category || e.category === category)
    .filter((e) => !supplier || e.supplierId === supplier)
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .filter((e) => !q || `${e.id} ${e.subType} ${e.description} ${e.workerName ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  const byCat = Object.fromEntries(COST_CATEGORIES.map((k) => [k, rows.filter((e) => e.category === k).reduce((a, e) => a + e.amount, 0)])) as Record<CostCategory, number>
  const total = rows.reduce((a, e) => a + e.amount, 0)

  return (
    <>
      <PageHeader title="Expenses" subtitle="All direct costs — every entry is booked to Project → Phase → Expense." actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add expense</Button>} />
      <KpiGrid cols={5}>
        <Kpi label="Total (filtered)" value={formatCompact(total)} sub={`${rows.length} entries`} />
        {COST_CATEGORIES.map((k) => (
          <button key={k} type="button" className="text-left" onClick={() => setCategory(category === k ? '' : k)}>
            <Kpi label={COST_LABEL[k]} value={formatCompact(byCat[k])} sub={category === k ? 'Filtered — click to clear' : `${total ? ((byCat[k] / total) * 100).toFixed(1) : 0}% of total`} tone={category === k ? 'info' : 'neutral'} />
          </button>
        ))}
      </KpiGrid>
      <Card className="mt-5" bodyClassName="">
        <FilterBar>
          <div className="relative w-56"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><Input className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-48" value={project} onChange={(e) => { setProject(e.target.value); setPhase('') }}><option value="">All projects</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select>
          <Select className="w-52" value={phase} onChange={(e) => setPhase(e.target.value)} disabled={!project}><option value="">All phases</option>{db.phases.filter((p) => p.projectId === project).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select className="w-40" value={category} onChange={(e) => setCategory(e.target.value as CostCategory | '')}><option value="">All categories</option>{COST_CATEGORIES.map((k) => <option key={k} value={k}>{COST_LABEL[k]}</option>)}</Select>
          <Select className="w-56" value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">All suppliers</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Input type="date" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
          <Input type="date" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        </FilterBar>
        <ExpenseTable expenses={rows} />
      </Card>
      <ExpenseForm open={open} onClose={() => setOpen(false)} defaults={{ projectId: project || undefined, phaseId: phase || undefined, category: category || undefined }} />
    </>
  )
}
