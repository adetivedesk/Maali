import type { ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatAxis, formatCompact, formatINR } from '../lib/format'

// Categorical palette (validated: adjacent CVD ΔE ≥ 9 on light surface).
// Fixed slot order — colour follows the entity, never its rank.
export const SERIES = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
}

export const COST_COLORS = { material: SERIES.blue, labour: SERIES.orange, outsource: SERIES.aqua, other: SERIES.yellow }

const GRID = '#e5e7eb'
const AXIS_TEXT = '#6b7280'

export interface SeriesDef { key: string; label: string; color: string }

function ChartTooltip({ active, payload, label, series }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; series: SeriesDef[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-navy-900">{label}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key)
        if (!p) return null
        return (
          <div key={s.key} className="flex items-center justify-between gap-6 py-0.5">
            <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
            <span className="num font-medium text-slate-900">{formatINR(p.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
      ))}
    </div>
  )
}

/** Grouped (or stacked) vertical bars on one shared ₹ axis. */
export function BarsChart({ data, xKey, series, stacked, height = 260 }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; stacked?: boolean; height?: number }) {
  return (
    <div>
      {series.length > 1 && <Legend series={series} />}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: '#d1d5db' }} tick={{ fontSize: 11, fill: AXIS_TEXT }} interval={0} />
          <YAxis tickFormatter={formatAxis} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={52} />
          <Tooltip cursor={{ fill: 'rgba(15,31,58,0.04)' }} content={<ChartTooltip series={series} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? 'a' : undefined}
              maxBarSize={stacked ? 44 : 26}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              stroke={stacked ? '#fff' : undefined}
              strokeWidth={stacked ? 1 : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal single-series bars, coloured by sign (profit / variance). */
export function SignedBars({ data, height = 220, label = 'Profit' }: { data: { name: string; value: number }[]; height?: number; label?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={formatAxis} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#334155' }} width={110} />
        <ReferenceLine x={0} stroke="#9ca3af" />
        <Tooltip cursor={{ fill: 'rgba(15,31,58,0.04)' }} content={<ChartTooltip series={[{ key: 'value', label, color: SERIES.aqua }]} />} />
        <Bar dataKey="value" maxBarSize={22} radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: unknown) => formatCompact(Number(v)), fontSize: 11, fill: '#334155' }}>
          {data.map((d) => <Cell key={d.name} fill={d.value >= 0 ? SERIES.aqua : '#d03b3b'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** 100% split meter: e.g. Received vs Pending. */
export function SplitMeter({ parts, total, caption }: { parts: { label: string; value: number; color: string }[]; total?: number; caption?: ReactNode }) {
  const t = total ?? parts.reduce((a, p) => a + p.value, 0)
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) => p.value > 0 && (
          <div key={p.label} title={`${p.label}: ${formatINR(p.value)}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / (t || 1)) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0,1fr))` }}>
        {parts.map((p) => (
          <div key={p.label}>
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.label}</div>
            <div className="num mt-0.5 text-base font-semibold text-navy-900">{formatCompact(p.value)}</div>
            <div className="num text-[11px] text-slate-400">{t ? ((p.value / t) * 100).toFixed(1) : '0.0'}%</div>
          </div>
        ))}
      </div>
      {caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  )
}
