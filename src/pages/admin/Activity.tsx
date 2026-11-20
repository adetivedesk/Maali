import { Fragment, useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Button, Card, EmptyRow, FilterBar, Input, PageHeader, Pill, Table, Td, Th } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { api, useStore } from '../../store/store'

interface Change { collection: string; id: string; op: 'insert' | 'update' | 'delete'; before?: Record<string, unknown>; after?: Record<string, unknown> }
interface Entry { id: string; at: string; version: string | null; user_name: string; action: string; summary: string; changes: Change[] }

const OP_TONE = { insert: 'green', update: 'blue', delete: 'red' } as const
const OP_LABEL = { insert: 'added', update: 'changed', delete: 'removed' } as const

const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Field-level differences between two versions of a record. */
function fieldDiff(c: Change) {
  const keys = [...new Set([...Object.keys(c.before ?? {}), ...Object.keys(c.after ?? {})])]
  return keys.filter((k) => JSON.stringify(c.before?.[k]) !== JSON.stringify(c.after?.[k])).map((k) => ({ k, from: c.before?.[k], to: c.after?.[k] }))
}

export function Activity() {
  const { notify } = useStore()
  const [entries, setEntries] = useState<Entry[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (before?: string) => {
    setLoading(true)
    try {
      const { entries: rows } = await api<{ entries: Entry[] }>(`admin?view=audit&limit=50&q=${encodeURIComponent(q)}${before ? `&before=${before}` : ''}`)
      setEntries((e) => (before ? [...e, ...rows] : rows))
      setMore(rows.length === 50)
    } catch (e) { notify((e as Error).message, 'error') } finally { setLoading(false) }
  }, [q, notify])

  useEffect(() => { const t = setTimeout(() => void load(), 300); return () => clearTimeout(t) }, [load])

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <>
      <PageHeader title="Activity Log" subtitle="Every change, who made it and when — with the values before and after." />
      <Card bodyClassName="">
        <FilterBar>
          <div className="relative w-full sm:w-80"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><Input className="pl-9" placeholder="Search user, action, record id (e.g. EXP-078)…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </FilterBar>
        <Table>
          <thead><tr><Th className="w-8" /><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Summary</Th><Th>Records</Th></tr></thead>
          <tbody>
            {!loading && entries.length === 0 && <EmptyRow cols={6}>No activity found</EmptyRow>}
            {entries.map((e) => {
              const isOpen = open.has(e.id)
              const d = new Date(e.at)
              return (
                <Fragment key={e.id}>
                  <tr className="cursor-pointer hover:bg-slate-50/60" onClick={() => e.changes.length && toggle(e.id)}>
                    <Td className="text-slate-400">{e.changes.length > 0 && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))} <span className="text-slate-500">{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span></Td>
                    <Td className="whitespace-nowrap font-medium">{e.user_name}</Td>
                    <Td className="font-mono text-xs">{e.action}</Td>
                    <Td className="text-slate-600">{e.summary || '—'}</Td>
                    <Td className="space-x-1">{e.changes.slice(0, 4).map((c, i) => <Pill key={i} tone={OP_TONE[c.op]}>{c.id}</Pill>)}{e.changes.length > 4 && <span className="text-xs text-slate-400">+{e.changes.length - 4}</span>}</Td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={6} className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                      <div className="space-y-2.5">
                        {e.changes.map((c, i) => (
                          <div key={i} className="text-xs">
                            <div className="font-medium text-slate-700"><Pill tone={OP_TONE[c.op]}>{OP_LABEL[c.op]}</Pill> <span className="font-mono">{c.collection} · {c.id}</span></div>
                            {c.op === 'update' ? (
                              <table className="mt-1 text-[11px]"><tbody>
                                {fieldDiff(c).map(({ k, from, to }) => (
                                  <tr key={k}><td className="pr-3 text-slate-500">{k}</td><td className="pr-2 text-red-700 line-through">{show(from)}</td><td className="text-emerald-700">{show(to)}</td></tr>
                                ))}
                              </tbody></table>
                            ) : (
                              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2 text-[11px] text-slate-600 ring-1 ring-slate-200">{JSON.stringify(c.after ?? c.before, null, 1)}</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </Table>
        {more && entries.length > 0 && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button size="sm" disabled={loading} onClick={() => load(entries[entries.length - 1].id)}>{loading ? 'Loading…' : 'Load older'}</Button>
          </div>
        )}
      </Card>
    </>
  )
}
