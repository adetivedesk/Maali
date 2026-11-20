import type { Database } from '../data/types'

// Row-level diff between two database states. Actions in actions.ts are
// immutable, so any row whose object identity changed was edited.

type Row = { id: string }
type Collection = keyof Database

export interface Changes {
  upserts: Partial<Record<Collection, Row[]>>
  deletes: Partial<Record<Collection, string[]>>
}

export function diffDatabase(prev: Database, next: Database): Changes {
  const changes: Changes = { upserts: {}, deletes: {} }
  for (const c of Object.keys(next) as Collection[]) {
    const a = (prev[c] ?? []) as Row[]
    const b = next[c] as Row[]
    if (a === b) continue
    const before = new Map(a.map((r) => [r.id, r]))
    const upserts = b.filter((r) => before.get(r.id) !== r)
    const keep = new Set(b.map((r) => r.id))
    const deletes = a.filter((r) => !keep.has(r.id)).map((r) => r.id)
    if (upserts.length) changes.upserts[c] = upserts
    if (deletes.length) changes.deletes[c] = deletes
  }
  return changes
}

/** Apply a change set (from the server) to a local state; new rows go to the end, as on the server. */
export function applyChanges(db: Database, changes: Changes): Database {
  const next = { ...db }
  for (const c of new Set([...Object.keys(changes.upserts), ...Object.keys(changes.deletes)]) as Set<Collection>) {
    const gone = new Set(changes.deletes[c] ?? [])
    const up = new Map((changes.upserts[c] ?? []).map((r) => [r.id, r]))
    const list = ((db[c] ?? []) as Row[]).filter((r) => !gone.has(r.id)).map((r) => up.get(r.id) ?? r)
    const known = new Set(list.map((r) => r.id))
    for (const r of up.values()) if (!known.has(r.id)) list.push(r)
    ;(next as Record<Collection, Row[]>)[c] = list
  }
  return next
}

export const hasChanges =(c: Changes) => Object.keys(c.upserts).length > 0 || Object.keys(c.deletes).length > 0
