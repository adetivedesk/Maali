import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button, Card, EmptyRow, FilterBar, Input, Money, PageHeader, Progress, Select, StatusBadge, Table, Td, Th } from '../components/ui'
import { projectFinancials } from '../lib/calc'
import { formatDate } from '../lib/format'
import { useStore } from '../store/store'

export function Projects() {
  const { db } = useStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [client, setClient] = useState('')
  const [pm, setPm] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const pms = [...new Set(db.projects.map((p) => p.projectManager))]
  const statuses = [...new Set(db.projects.map((p) => p.status))]
  const rows = db.projects
    .filter((p) => !q || `${p.name} ${p.id} ${p.location}`.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => !status || p.status === status)
    .filter((p) => !client || p.clientId === client)
    .filter((p) => !pm || p.projectManager === pm)
    .filter((p) => (!from || p.endDate >= from) && (!to || p.startDate <= to))
    .map((p) => projectFinancials(db, p.id))

  const totals = rows.reduce((a, f) => ({ revenue: a.revenue + f.revenue, received: a.received + f.received, cost: a.cost + f.actual.total, profit: a.profit + f.actualProfit }), { revenue: 0, received: 0, cost: 0, profit: 0 })

  return (
    <>
      <PageHeader title="Projects" subtitle="Every project with contracted value, cash received, cost and profit."
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/quotations')}>New project from quotation</Button>} />
      <Card bodyClassName="">
        <FilterBar>
          <div className="relative w-64"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><Input className="pl-9" placeholder="Search project, code, location…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select className="w-52" value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{db.clients.filter((c) => db.projects.some((p) => p.clientId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select className="w-48" value={pm} onChange={(e) => setPm(e.target.value)}><option value="">All project managers</option>{pms.map((m) => <option key={m}>{m}</option>)}</Select>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">Active between <Input type="date" className="w-36 max-sm:flex-1" value={from} onChange={(e) => setFrom(e.target.value)} /> and <Input type="date" className="w-36 max-sm:flex-1" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {(q || status || client || pm || from || to) && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setStatus(''); setClient(''); setPm(''); setFrom(''); setTo('') }}>Clear</Button>}
        </FilterBar>
        <Table>
          <thead>
            <tr><Th>Project</Th><Th>Client</Th><Th>Manager</Th><Th>Schedule</Th><Th right>Contract</Th><Th right>Received</Th><Th right>Cost</Th><Th right>Profit</Th><Th>Completion</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={10} />}
            {rows.map((f) => (
              <tr key={f.project.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => navigate(`/projects/${f.project.id}`)}>
                <Td><Link to={`/projects/${f.project.id}`} className="font-medium text-navy-900 hover:text-blue-600">{f.project.name}</Link><div className="text-xs text-slate-400">{f.project.id} · {f.project.location}</div></Td>
                <Td>{db.clients.find((c) => c.id === f.project.clientId)?.name}</Td>
                <Td className="whitespace-nowrap text-slate-600">{f.project.projectManager}</Td>
                <Td className="whitespace-nowrap text-xs text-slate-500">{formatDate(f.project.startDate)}<br />→ {formatDate(f.project.endDate)}</Td>
                <Td right><Money value={f.revenue} compact />{f.changeOrderRevenue > 0 && <div className="text-[11px] text-blue-600">incl. CO {Math.round(f.changeOrderRevenue / 1e5 * 100) / 100}L</div>}</Td>
                <Td right><Money value={f.received} compact /></Td>
                <Td right><Money value={f.actual.total} compact /></Td>
                <Td right><Money value={f.actualProfit} compact signTone /></Td>
                <Td className="w-36"><Progress value={f.completion} /></Td>
                <Td><StatusBadge status={f.project.status} /></Td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-navy-900">
                <Td colSpan={4}>Total · {rows.length} projects</Td>
                <Td right><Money value={totals.revenue} compact /></Td>
                <Td right><Money value={totals.received} compact /></Td>
                <Td right><Money value={totals.cost} compact /></Td>
                <Td right><Money value={totals.profit} compact /></Td>
                <Td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>
    </>
  )
}
