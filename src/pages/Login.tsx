import { useState, type FormEvent, type ReactNode } from 'react'
import { Building2, KeyRound, LogIn } from 'lucide-react'
import { api, type SessionUser } from '../store/store'

function Shell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-800 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-white"><Building2 size={20} /></span>
          <div>
            <div className="text-base font-semibold text-navy-900">Maali ERP</div>
            <div className="text-xs text-slate-500">Civil project management</div>
          </div>
        </div>
        <h1 className="text-lg font-semibold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
const label = 'mb-1 block text-xs font-medium text-slate-600'

export function LoginScreen({ message, onSignedIn }: { message?: string; onSignedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api('auth', { method: 'POST', body: JSON.stringify({ action: 'login', username, password }) })
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }
  return (
    <Shell title="Sign in" subtitle="Use the username and password given by your administrator.">
      {message && !error && <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{message}</div>}
      <form onSubmit={submit} className="space-y-3.5">
        <div><label className={label} htmlFor="u">Username</label><input id="u" className={input} autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div><label className={label} htmlFor="p">Password</label><input id="p" type="password" className={input} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <button type="submit" disabled={busy || !username || !password} className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
          <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-5 text-center text-[11px] text-slate-400">Forgot your password? Ask an administrator to reset it.</p>
    </Shell>
  )
}

/** Password form, used for the forced first-login change and from the user menu. */
export function PasswordForm({ onDone, submitLabel = 'Change password' }: { onDone: (user: SessionUser) => void; submitLabel?: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mismatch = confirm && next !== confirm
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next !== confirm) return
    setBusy(true); setError('')
    try {
      const { user } = await api<{ user: SessionUser }>('auth', { method: 'POST', body: JSON.stringify({ action: 'changePassword', current, next }) })
      onDone(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div><label className={label} htmlFor="cp">Current password</label><input id="cp" type="password" className={input} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div><label className={label} htmlFor="np">New password</label><input id="np" type="password" className={input} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="mt-1 text-[11px] text-slate-500">At least 8 characters, with letters and numbers.</p></div>
      <div><label className={label} htmlFor="cf">Confirm new password</label><input id="cf" type="password" className={input} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {mismatch && <p className="mt-1 text-[11px] text-red-600">Passwords do not match</p>}</div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <button type="submit" disabled={busy || !current || !next || next !== confirm} className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50">
        <KeyRound size={16} /> {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

export function ChangePasswordScreen({ user, onDone, onSignOut }: { user: SessionUser; onDone: () => void; onSignOut: () => void }) {
  return (
    <Shell title={`Welcome, ${user.name}`} subtitle="You are using a one-time password. Choose your own password to continue.">
      <PasswordForm onDone={onDone} submitLabel="Set password and continue" />
      <button type="button" onClick={onSignOut} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-700">Sign out</button>
    </Shell>
  )
}
