import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PhaseStatusSelect } from '../components/tables'
import { Card, EmptyRow, FilterBar, Money, PageHeader, Progress, Select, Table, Td, Th, Variance } from '../components/ui'
import { PHASE_STATUSES } from '../data/types'
import { phaseFinancials } from '../lib/calc'
import { formatPct } from '../lib/format'
import { useStore } from '../store/store'

export function Phases() {
  const { db } = useStore()
  const navigate = useNavigate()
  const [project, setProject] = useState('')
  const [status, setStatus] = useState('')
  const rows = db.phases
    .filter((p) => !project || p.projectId === project)
    .filter((p) => !status || p.status === status)
    .sort((a, b) => a.projectId.localeCompare(b.projectId) || a.sequence - b.sequence)
    .map((p) => ({ p, f: phaseFinancials(db, p) }))

  return (
    <>
      <PageHeader title="Phases" subtitle="Phase-level revenue, budget, actual cost, billing and status across all projects." />
      <Card bodyClassName="">
        <FilterBar>
          <Select className="w-64" value={project} onChange={(e) => setProject(e.target.value)}><option value="">All projects</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{PHASE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
          <span className="text-xs text-slate-500 lg:ml-auto">Status flow: Planned → In Progress → Completed → Billed → Payment Received → Closed</span>
        </FilterBar>
        <Table>
          <thead><tr><Th>Phase</Th><Th>Project</Th><Th right>Revenue</Th><Th right>Planned</Th><Th right>Actual</Th><Th right>Variance</Th><Th right>Actual profit</Th><Th right>Margin</Th><Th right>Billed</Th><Th right>Pending</Th><Th>Completion</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={12} />}
            {rows.map(({ p, f }) => (
              <tr key={p.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => navigate(`/phases/${p.id}`)}>
                <Td><Link to={`/phases/${p.id}`} className="font-medium text-navy-900 hover:text-blue-600">{p.name}</Link><div className="text-xs text-slate-400">{p.id}</div></Td>
                <Td className="whitespace-nowrap">{db.projects.find((x) => x.id === p.projectId)?.shortName}</Td>
                <Td right><Money value={f.revenue} compact /></Td>
                <Td right><Money value={f.planned.total} compact /></Td>
                <Td right><Money value={f.actual.total} compact /></Td>
                <Td right><Variance value={f.budgetVariance} compact /></Td>
                <Td right>{f.done ? <Money value={f.actualProfit} compact signTone /> : <span className="text-xs text-slate-400">WIP</span>}</Td>
                <Td right>{f.done ? formatPct(f.actualMargin) : '—'}</Td>
                <Td right><Money value={f.billed} compact /></Td>
                <Td right><Money value={f.clientPending} compact className={f.clientPending ? 'text-red-600' : 'text-slate-400'} /></Td>
                <Td className="w-32"><Progress value={f.completion} /></Td>
                <Td><PhaseStatusSelect phase={p} disabled={p.status === 'Closed'} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
