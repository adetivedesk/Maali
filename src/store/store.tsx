import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Database } from '../data/types'
import { createSeed } from '../data/seed'

// Demo data source: seed + localStorage. Replace load/save with API calls
// (or React Query) when the backend is ready; screens only use useStore().

const STORAGE_KEY = 'maali-erp-demo-db-v1'

function load(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Database
  } catch { /* storage unavailable — fall back to seed */ }
  return createSeed()
}

interface Toast { id: number; message: string; tone: 'success' | 'info' | 'error' }

interface StoreValue {
  db: Database
  /** Commit a new database state (output of an action in actions.ts). */
  commit: (next: Database, message?: string) => void
  notify: (message: string, tone?: Toast['tone']) => void
  reset: () => void
  toasts: Toast[]
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(load)
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)) } catch { /* ignore */ }
  }, [db])

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const commit = useCallback((next: Database, message?: string) => {
    setDb(next)
    if (message) notify(message)
  }, [notify])

  const reset = useCallback(() => {
    setDb(createSeed())
    notify('Demo data reset to the original seed', 'info')
  }, [notify])

  return <StoreContext.Provider value={{ db, commit, notify, reset, toasts }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/** Lookup helpers shared by screens. */
export function useLookups() {
  const { db } = useStore()
  return {
    client: (id?: string) => db.clients.find((c) => c.id === id),
    project: (id?: string) => db.projects.find((p) => p.id === id),
    phase: (id?: string) => db.phases.find((p) => p.id === id),
    supplier: (id?: string) => db.suppliers.find((s) => s.id === id),
  }
}
