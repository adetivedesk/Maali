import clsx from 'clsx'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Circle, Clock, Info, X, XCircle } from 'lucide-react'
import { formatCompact, formatINR, formatPct } from '../lib/format'
import { useStore } from '../store/store'

// ---- Layout ------------------------------------------------------------------

export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[] }) {
  return (
    <div className="mb-6">
      {crumbs && (
        <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-300">/</span>}
              {c.to ? <Link to={c.to} className="hover:text-blue-600">{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-navy-900 sm:text-[22px] [&>span]:flex-wrap">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Card({ title, subtitle, actions, children, className, bodyClassName }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(bodyClassName ?? 'p-4 sm:p-5')}>{children}</div>
    </section>
  )
}

type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info'

const toneText: Record<Tone, string> = {
  neutral: 'text-navy-900', positive: 'text-emerald-700', negative: 'text-red-600', warning: 'text-amber-700', info: 'text-blue-700',
}

export function Kpi({ label, value, sub, tone = 'neutral', icon, to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode; to?: string }) {
  const body = (
    <div className={clsx('h-full rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4 sm:py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', to && 'transition hover:border-blue-300 hover:shadow-sm')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className={clsx('mt-1.5 break-words text-lg font-semibold tracking-tight sm:text-xl', toneText[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const c = { 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-3 xl:grid-cols-5', 6: 'md:grid-cols-3 xl:grid-cols-6' }[cols]
  return <div className={clsx('grid grid-cols-2 gap-2.5 sm:gap-3', c)}>{children}</div>
}

// ---- Status badges -----------------------------------------------------------

type BadgeTone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'navy'

const STATUS_TONE: Record<string, BadgeTone> = {
  Active: 'green', Paid: 'green', 'Payment Received': 'green', Approved: 'green', Completed: 'green', Signed: 'green',
  'In Progress': 'blue', Sent: 'blue', Billed: 'blue', Quotation: 'blue',
  'Partially Paid': 'amber', 'Under Review': 'amber', 'Awaiting Approval': 'amber', 'Pending Approval': 'amber',
  'On Hold': 'amber', 'Pending Signature': 'amber', 'Contract Pending': 'amber',
  Overdue: 'red', Rejected: 'red', Cancelled: 'red', Unpaid: 'red', Expired: 'red',
  Draft: 'slate', Planned: 'slate', Unbilled: 'slate', Closed: 'navy',
}

const BADGE: Record<BadgeTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  navy: 'bg-navy-900 text-white ring-navy-900',
}

const BADGE_ICON: Record<BadgeTone, typeof Circle> = {
  green: CheckCircle2, blue: Clock, amber: AlertTriangle, red: XCircle, slate: Circle, navy: CheckCircle2,
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? 'slate'
  const Icon = BADGE_ICON[tone]
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', BADGE[tone], className)}>
      <Icon size={11} strokeWidth={2.5} />
      {status}
    </span>
  )
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={clsx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', BADGE[tone])}>{children}</span>
}

// ---- Numbers -----------------------------------------------------------------

export function Money({ value, compact, className, signTone }: { value: number; compact?: boolean; className?: string; signTone?: boolean }) {
  return (
    <span className={clsx('num whitespace-nowrap', signTone && (value < 0 ? 'text-red-600' : value > 0 ? 'text-emerald-700' : ''), className)}>
      {compact ? formatCompact(value) : formatINR(value)}
    </span>
  )
}

/** Cost variance: negative (under budget) is good. */
export function Variance({ value, compact }: { value: number; compact?: boolean }) {
  if (Math.round(value) === 0) return <span className="num text-slate-500">₹0</span>
  const over = value > 0
  return (
    <span className={clsx('num inline-flex items-center gap-1 whitespace-nowrap font-medium', over ? 'text-red-600' : 'text-emerald-700')}>
      {over ? '▲ +' : '▼ '}{compact ? formatCompact(value) : formatINR(value)}
    </span>
  )
}

export function Progress({ value, className, tone }: { value: number; className?: string; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const v = Math.max(0, Math.min(100, value))
  const t = tone ?? (v >= 100 ? 'green' : 'blue')
  const bar = { blue: 'bg-blue-600', green: 'bg-emerald-600', amber: 'bg-amber-500', red: 'bg-red-600' }[t]
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={clsx('h-full rounded-full', bar)} style={{ width: `${v}%` }} />
      </div>
      <span className="num w-9 text-right text-xs text-slate-600">{formatPct(v, 0)}</span>
    </div>
  )
}

// ---- Tables ------------------------------------------------------------------

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm max-md:min-w-max">{children}</table>
    </div>
  )
}

export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={clsx('whitespace-nowrap border-b border-slate-200 bg-slate-50/80 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 first:pl-5 last:pr-5', right ? 'text-right' : 'text-left', className)}>
      {children}
    </th>
  )
}

export function Td({ children, right, className, colSpan }: { children?: ReactNode; right?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={clsx('border-b border-slate-100 px-3 py-2.5 align-middle first:pl-5 last:pr-5', right && 'num text-right', className)}>
      {children}
    </td>
  )
}

export function EmptyRow({ cols, children = 'No records found' }: { cols: number; children?: ReactNode }) {
  return <tr><td colSpan={cols} className="px-5 py-10 text-center text-sm text-slate-400">{children}</td></tr>
}

// ---- Controls ----------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

export function Button({ variant = 'secondary', size = 'md', className, icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  const v = {
    primary: 'bg-navy-900 text-white hover:bg-navy-800 shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  }[variant]
  return (
    <button
      type="button"
      className={clsx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm', v, className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

const control = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(control, className)} {...rest} />
}

export function NumberInput({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={clsx(control, 'num', className)}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      {...rest}
    />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(control, 'pr-8', className)} {...rest}>{children}</select>
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(control, className)} rows={3} {...rest} />
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:px-3.5', value === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-[11px] text-slate-500">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 max-sm:*:w-full sm:px-5">{children}</div>
}

// ---- Overlays ----------------------------------------------------------------

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-2xl' }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 pt-4 backdrop-blur-[2px] sm:p-4 sm:pt-[6vh]" onMouseDown={onClose}>
      <div className={clsx('w-full rounded-2xl bg-white shadow-2xl', width)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-navy-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/70 px-4 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>
  )
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'success' | 'danger'; children: ReactNode }) {
  const s = {
    info: ['bg-blue-50 text-blue-900 ring-blue-200', Info],
    warning: ['bg-amber-50 text-amber-900 ring-amber-200', AlertTriangle],
    success: ['bg-emerald-50 text-emerald-900 ring-emerald-200', CheckCircle2],
    danger: ['bg-red-50 text-red-900 ring-red-200', XCircle],
  } as const
  const [cls, Icon] = s[tone]
  return (
    <div className={clsx('flex gap-2.5 rounded-lg px-3.5 py-2.5 text-sm ring-1 ring-inset', cls)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function ToastHost() {
  const { toasts } = useStore()
  return (
    <div className="no-print pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex flex-col items-end gap-2 sm:bottom-5 sm:left-auto sm:right-5">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg', t.tone === 'error' ? 'bg-red-600' : t.tone === 'info' ? 'bg-navy-800' : 'bg-emerald-600')}>
          {t.tone === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          {t.message}
        </div>
      ))}
    </div>
  )
}

/** Label/value row for summary panels. */
export function Stat({ label, children, strong, border = true }: { label: ReactNode; children: ReactNode; strong?: boolean; border?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-between gap-x-4 gap-y-0.5 py-2 text-sm', border && 'border-b border-slate-100 last:border-0', strong && 'font-semibold text-navy-900')}>
      <span className={strong ? '' : 'text-slate-600'}>{label}</span>
      <span className="num text-right">{children}</span>
    </div>
  )
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px] text-slate-500">{children}</span>
}
