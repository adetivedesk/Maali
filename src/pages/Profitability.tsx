import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarsChart, COST_COLORS, SERIES, SplitMeter } from '../components/charts'
import { PlannedVsActualTable } from '../components/tables'
import { Card, Field, Kpi, KpiGrid, Money, PageHeader, Select, Stat, Table, Td, Th, Variance } from '../components/ui'
import { COST_CATEGORIES, COST_LABEL, phaseFinancials, projectFinancials, projectPhases } from '../lib/calc'
import { formatINR, formatPct } from '../lib/format'
import { useStore } from '../store/store'

export function Profitability() {
  const { db } = useStore()
  const [projectId, setProjectId] = useState(db.projects.find((p) => p.status === 'Active')?.id ?? db.projects[0]?.id ?? '')
  const [phaseId, setPhaseId] = useState('PH-001')
  const phases = projectPhases(db, projectId)
  const phase = phases.find((p) => p.id === phaseId)
  const pf = projectFinancials(db, projectId)
  const view = phase ? phaseFinancials(db, phase) : null

  const ZERO = { material: 0, labour: 0, outsource: 0, other: 0, total: 0 }
  // Unify phase / project view
  const v = view
    ? { revenue: view.revenue, recognised: view.completedRevenue, recognisedCost: view.done ? view.actual : ZERO, wip: view.wipCost, billedProfit: view.billedProfit, planned: view.planned, actual: view.actual, expected: view.expectedProfit, expectedMargin: view.expectedMargin, profit: view.actualProfit, margin: view.actualMargin, forecast: view.forecastProfit, completion: view.completion }
    : { revenue: pf.revenue, recognised: pf.completedRevenue, recognisedCost: pf.completedActual, wip: pf.wipCost, billedProfit: pf.billedProfit, planned: pf.planned, actual: pf.actual, expected: pf.expectedProfit, expectedMargin: pf.expectedMargin, profit: pf.actualProfit, margin: pf.actualMargin, forecast: pf.forecastProfit, completion: pf.completion }

  const all = db.projects.filter((p) => !['Draft', 'Quotation', 'Rejected', 'Cancelled'].includes(p.status)).map((p) => projectFinancials(db, p.id))

  return (
    <>
      <PageHeader title="Profitability" subtitle="Profit is recognised when a phase completes: revenue − material − own labour − outsource − other direct." />
      <Card bodyClassName="flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5">
        <Field label="Project" className="w-full sm:w-72">
          <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPhaseId(projectPhases(db, e.target.value)[0]?.id ?? '') }}>
            {db.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Phase" className="w-full sm:w-72">
          <Select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            <option value="">All phases (project total)</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Link to={phase ? `/phases/${phase.id}` : `/projects/${projectId}`} className="mb-2 text-sm font-medium text-blue-600 hover:underline">Open {phase ? 'phase' : 'project'} →</Link>
      </Card>

      <div className="mt-5">
        <KpiGrid cols={6}>
          <Kpi label="Revenue" value={formatINR(v.revenue)} sub={`${formatINR(v.recognised)} from completed phases`} />
          <Kpi label="Planned cost" value={formatINR(v.planned.total)} />
          <Kpi label="Actual cost" value={formatINR(v.actual.total)} tone={v.actual.total > v.planned.total ? 'negative' : 'neutral'} />
          <Kpi label="Expected profit" value={formatINR(v.expected)} sub={formatPct(v.expectedMargin)} />
          <Kpi label="Actual profit" value={v.recognised ? formatINR(v.profit) : 'In progress'} tone={v.profit >= 0 ? 'positive' : 'negative'} sub={`billed profit ${formatINR(v.billedProfit)}`} />
          <Kpi label="Forecast profit" value={formatINR(v.forecast)} tone="positive" sub={v.recognised ? `actual margin ${formatPct(v.margin, 2)}` : 'at completion'} />
        </KpiGrid>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Profit calculation">
          <Stat label="Revenue of completed phases">{formatINR(v.recognised)}</Stat>
          {COST_CATEGORIES.map((k) => <Stat key={k} label={`− ${COST_LABEL[k]} cost`}>{formatINR(-v.recognisedCost[k])}</Stat>)}
          <Stat label="= Actual profit" strong><span className={v.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatINR(v.profit)}</span></Stat>
          <div className="mt-2 text-xs text-slate-500">Margin = {formatINR(v.profit)} ÷ {formatINR(v.recognised)} × 100 = <b>{formatPct(v.margin, 2)}</b></div>
          {v.wip > 0 && <div className="mt-1 text-xs text-slate-500">Not in profit yet: <b>{formatINR(v.wip)}</b> cost on unfinished phases (work in progress).</div>}
        </Card>
        <Card title="Cost breakdown">
          <SplitMeter parts={COST_CATEGORIES.filter((k) => k !== 'other' || v.actual.other > 0).map((k) => ({ label: COST_LABEL[k], value: v.actual[k], color: COST_COLORS[k] }))} />
        </Card>
        <Card title="Planned vs Actual">
          <BarsChart height={200} xKey="name" data={COST_CATEGORIES.map((k) => ({ name: COST_LABEL[k], planned: v.planned[k], actual: v.actual[k] }))}
            series={[{ key: 'planned', label: 'Planned', color: SERIES.blue }, { key: 'actual', label: 'Actual', color: SERIES.orange }]} />
        </Card>
      </div>

      <Card className="mt-5" title="Planned vs Actual — detail" bodyClassName=""><PlannedVsActualTable planned={v.planned} actual={v.actual} completion={v.completion} /></Card>

      <Card className="mt-5" title="Phase profitability" subtitle={pf.project.name} bodyClassName="">
        <Table>
          <thead><tr><Th>Phase</Th><Th right>Revenue</Th><Th right>Material</Th><Th right>Own labour</Th><Th right>Outsource</Th><Th right>Other</Th><Th right>Actual cost</Th><Th right>Variance</Th><Th right>Actual profit</Th><Th right>Margin</Th></tr></thead>
          <tbody>
            {phases.map((p) => {
              const f = phaseFinancials(db, p)
              return (
                <tr key={p.id} className={p.id === phaseId ? 'bg-blue-50/50' : 'hover:bg-slate-50/60'} onClick={() => setPhaseId(p.id)} style={{ cursor: 'pointer' }}>
                  <Td className="font-medium text-navy-900">{p.name}</Td>
                  <Td right><Money value={f.revenue} /></Td>
                  {COST_CATEGORIES.map((k) => <Td key={k} right><Money value={f.actual[k]} /></Td>)}
                  <Td right><Money value={f.actual.total} /></Td>
                  <Td right><Variance value={f.budgetVariance} /></Td>
                  <Td right>{f.done ? <Money value={f.actualProfit} signTone /> : <span className="text-xs text-slate-400">WIP</span>}</Td>
                  <Td right>{f.done ? formatPct(f.actualMargin) : '—'}</Td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold text-navy-900">
              <Td>Project total</Td><Td right><Money value={pf.revenue} /></Td>
              {COST_CATEGORIES.map((k) => <Td key={k} right><Money value={pf.actual[k]} /></Td>)}
              <Td right><Money value={pf.actual.total} /></Td><Td right><Variance value={pf.budgetVariance} /></Td>
              <Td right><Money value={pf.actualProfit} /></Td><Td right>{formatPct(pf.actualMargin)}</Td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      <Card className="mt-5" title="Project profitability comparison" bodyClassName="">
        <Table>
          <thead><tr><Th>Project</Th><Th right>Total revenue</Th><Th right>Planned cost</Th><Th right>Actual cost</Th><Th right>Expected profit</Th><Th right>Actual profit</Th><Th right>Profit variance</Th><Th right>Margin</Th><Th right>Forecast profit</Th></tr></thead>
          <tbody>
            {all.map((f) => (
              <tr key={f.project.id} className="hover:bg-slate-50/60">
                <Td><Link to={`/projects/${f.project.id}`} className="font-medium text-navy-900 hover:text-blue-600">{f.project.shortName}</Link></Td>
                <Td right><Money value={f.revenue} compact /></Td>
                <Td right><Money value={f.planned.total} compact /></Td>
                <Td right><Money value={f.actual.total} compact /></Td>
                <Td right><Money value={f.expectedProfit} compact /></Td>
                <Td right><Money value={f.actualProfit} compact signTone /></Td>
                <Td right><Money value={f.profitVariance} compact signTone /></Td>
                <Td right>{formatPct(f.actualMargin)}</Td>
                <Td right><Money value={f.forecastProfit} compact /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="px-5 py-3 text-xs text-slate-500">Profit variance compares actual profit with the budgeted profit of the same completed phases. Forecast profit assumes unfinished phases land at the higher of budget or cost already incurred.</p>
      </Card>
    </>
  )
}
