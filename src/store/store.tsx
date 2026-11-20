import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Database } from '../data/types'
import { createSeed } from '../data/seed'
import { can as canDo, fullAccess, type Level, type MenuKey, type Permissions } from '../lib/permissions'
import { DEFAULT_SETTINGS, type CompanySettings } from '../lib/settings'
import { isRuleError } from './actions'
import { runCommand, type CommandArgs, type CommandName, type CommandResult } from './commands'
import { applyChanges, type Changes } from './sync'
import { ChangePasswordScreen, LoginScreen } from '../pages/Login'

// Data source:
//  • 'cloud' — the /api functions (Vercel + Neon). Users sign in; every change is
//    a named command the server checks, runs, validates and saves.
//  • 'local' — no API reachable (e.g. the GitHub Pages build): browser-only demo
//    on the seed + localStorage, with full access.

const STORAGE_KEY = 'maali-erp-demo-db-v1'
const POLL_MS = 20_000

export type DataSource = 'cloud' | 'local'

export interface SessionUser {
  id: string
  username: string
  name: string
  email: string
  roleId: string
  roleName: string
  permissions: Permissions
  mustChangePassword: boolean
}

const DEMO_USER: SessionUser = {
  id: 'demo', username: 'demo', name: 'Demo user', email: '', roleId: 'ROLE-ADMIN', roleName: 'Demo (browser only)',
  permissions: fullAccess(), mustChangePassword: false,
}

function loadLocal(): Database {
  const seed = createSeed()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...seed, ...(JSON.parse(raw) as Partial<Database>) }
  } catch { /* storage unavailable — fall back to seed */ }
  return seed
}

// ---- HTTP -------------------------------------------------------------------

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
class NoApi extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'maali', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection.')
  }
  if (!res.headers.get('content-type')?.includes('application/json')) throw new NoApi(`No API at /api/${path} (HTTP ${res.status})`)
  const body = await res.json()
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`)
  return body as T
}

// ---- store ------------------------------------------------------------------

interface Toast { id: number; message: string; tone: 'success' | 'info' | 'error' }

export type RunResult<R> = { ok: true; result: R } | { ok: false; error: string }

export interface RunOptions {
  /** Toast shown on success; also recorded as the activity-log summary. */
  success?: string | ((result: never) => string)
  /** A file stored with the document this command creates (addDocument, uploadSignedContract). */
  file?: File
}

interface StoreValue {
  db: Database
  source: DataSource
  user: SessionUser
  settings: CompanySettings
  /** Run a business command. Errors are shown as a toast and returned as { ok: false }. */
  run: <K extends CommandName>(name: K, args: CommandArgs<K>, opts?: RunOptions) => Promise<RunResult<CommandResult<K>>>
  busy: boolean
  can: (menu: MenuKey, level?: Level) => boolean
  notify: (message: string, tone?: Toast['tone']) => void
  reload: () => Promise<void>
  setSettings: (s: CompanySettings) => void
  logout: () => void
  /** Browser-only demo: restore the seed. */
  resetLocal: () => void
  toasts: Toast[]
}

const StoreContext = createContext<StoreValue | null>(null)

type Boot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'login'; message?: string }
  | { status: 'changePassword'; user: SessionUser }
  | { status: 'ready'; source: DataSource; user: SessionUser; db: Database; version: number; settings: CompanySettings }

interface DbResponse { db: Database; version: number; settings: CompanySettings }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' })

  const start = useCallback(async (message?: string) => {
    setBoot({ status: 'loading' })
    try {
      const { user } = await api<{ user: SessionUser | null }>('auth')
      if (!user) return setBoot({ status: 'login', message })
      if (user.mustChangePassword) return setBoot({ status: 'changePassword', user })
      const data = await api<DbResponse>('db')
      setBoot({ status: 'ready', source: 'cloud', user, ...data })
    } catch (e) {
      if (e instanceof NoApi) setBoot({ status: 'ready', source: 'local', user: DEMO_USER, db: loadLocal(), version: 0, settings: DEFAULT_SETTINGS })
      else if (e instanceof ApiError && e.status === 401) setBoot({ status: 'login', message })
      // A server error means the API exists but failed: never silently fall back to browser storage.
      else setBoot({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => { void start() }, [start])

  const signedOut = useCallback((message = 'Your session has ended. Please sign in again.') => setBoot({ status: 'login', message }), [])

  switch (boot.status) {
    case 'loading': return <Splash>Loading…</Splash>
    case 'error':
      return (
        <Splash>
          <div className="font-medium text-red-700">Could not load data from the server</div>
          <div className="mt-1 max-w-md text-xs text-slate-500">{boot.message}</div>
          <button type="button" onClick={() => void start()} className="mt-4 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700">Retry</button>
        </Splash>
      )
    case 'login': return <LoginScreen message={boot.message} onSignedIn={() => void start()} />
    case 'changePassword': return <ChangePasswordScreen user={boot.user} onDone={() => void start()} onSignOut={() => api('auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).finally(() => signedOut('Signed out.'))} />
    case 'ready':
      return (
        <Store key={`${boot.source}-${boot.user.id}`} initial={boot} onSignedOut={signedOut}>
          {children}
        </Store>
      )
  }
}

function Splash({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-600">{children}</div>
}

interface CommandResponse { result: unknown; changes: Changes; version: number; baseVersion: number }

function Store({ initial, onSignedOut, children }: { initial: Extract<Boot, { status: 'ready' }>; onSignedOut: (message?: string) => void; children: ReactNode }) {
  const { source, user } = initial
  const [db, setDb] = useState<Database>(initial.db)
  const [settings, setSettings] = useState<CompanySettings>(initial.settings)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [inflight, setInflight] = useState(0)
  const seq = useRef(0)
  const current = useRef(initial.db)
  const version = useRef(initial.version)
  const pending = useRef(new Map<string, Promise<RunResult<unknown>>>())

  const replace = useCallback((next: Database) => { current.current = next; setDb(next) }, [])

  useEffect(() => {
    if (source !== 'local') return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)) } catch { /* ignore */ }
  }, [db, source])

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200)
  }, [])

  const handleAuth = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { onSignedOut(); return true }
    return false
  }, [onSignedOut])

  const reload = useCallback(async () => {
    if (source !== 'cloud') return
    try {
      const data = await api<DbResponse>('db')
      version.current = data.version
      replace(data.db)
      setSettings(data.settings)
    } catch (e) {
      if (!handleAuth(e)) notify(`Could not refresh: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }, [source, replace, handleAuth, notify])

  // Pick up other users' changes: poll the version while the tab is visible, and on focus.
  useEffect(() => {
    if (source !== 'cloud') return
    const check = async () => {
      if (document.visibilityState !== 'visible' || pending.current.size) return
      try {
        const { version: v } = await api<{ version: number }>('db?check=1')
        if (v !== version.current && !pending.current.size) await reload()
      } catch (e) { handleAuth(e) }
    }
    const timer = setInterval(check, POLL_MS)
    window.addEventListener('focus', check)
    return () => { clearInterval(timer); window.removeEventListener('focus', check) }
  }, [source, reload, handleAuth])

  const run = useCallback(<K extends CommandName>(name: K, args: CommandArgs<K>, opts: RunOptions = {}): Promise<RunResult<CommandResult<K>>> => {
    const key = JSON.stringify([name, args, opts.file?.name, opts.file?.size])
    // A double click must not save twice: reuse the request already in flight.
    const existing = pending.current.get(key)
    if (existing) return existing as Promise<RunResult<CommandResult<K>>>
    const label = (r: unknown) => (typeof opts.success === 'function' ? (opts.success as (r: unknown) => string)(r) : opts.success)

    const exec = async (): Promise<RunResult<CommandResult<K>>> => {
      if (source === 'local') {
        try {
          const [next, result] = runCommand(current.current, { user: user.name }, name, structuredClone(args) as unknown[])
          replace(next)
          const msg = label(result)
          if (msg) notify(msg)
          return { ok: true, result: result as CommandResult<K> }
        } catch (e) {
          const message = isRuleError(e) || e instanceof Error ? (e as Error).message : String(e)
          notify(message, 'error')
          return { ok: false, error: message }
        }
      }
      try {
        const summary = typeof opts.success === 'string' ? opts.success : undefined
        const out = opts.file
          ? await api<CommandResponse>('files', {
            method: 'POST',
            body: opts.file,
            headers: {
              'content-type': 'application/octet-stream',
              'x-file-name': encodeURIComponent(opts.file.name),
              'x-command': encodeURIComponent(JSON.stringify({ name, args, summary })),
            },
          })
          : await api<CommandResponse>('command', { method: 'POST', body: JSON.stringify({ name, args, summary }) })
        if (out.baseVersion === version.current) {
          replace(applyChanges(current.current, out.changes))
          version.current = out.version
        } else {
          await reload() // someone else saved in between: take the full current state
        }
        const msg = label(out.result)
        if (msg) notify(msg)
        return { ok: true, result: out.result as CommandResult<K> }
      } catch (e) {
        if (handleAuth(e)) return { ok: false, error: 'Signed out' }
        const message = e instanceof Error ? e.message : String(e)
        notify(message, 'error')
        if (e instanceof ApiError && e.status === 409) void reload()
        return { ok: false, error: message }
      }
    }

    setInflight((n) => n + 1)
    const p = exec().finally(() => { pending.current.delete(key); setInflight((n) => n - 1) })
    pending.current.set(key, p as Promise<RunResult<unknown>>)
    return p
  }, [source, user.name, replace, notify, reload, handleAuth])

  const can = useCallback((menu: MenuKey, level: Level = 'read') => canDo(user.permissions, menu, level), [user.permissions])

  const logout = useCallback(() => {
    api('auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).catch(() => {}).finally(() => onSignedOut('Signed out.'))
  }, [onSignedOut])

  const resetLocal = useCallback(() => {
    replace(createSeed())
    notify('Demo data reset to the original seed', 'info')
  }, [replace, notify])

  return (
    <StoreContext.Provider value={{ db, source, user, settings, run, busy: inflight > 0, can, notify, reload, setSettings, logout, resetLocal, toasts }}>
      {children}
    </StoreContext.Provider>
  )
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
