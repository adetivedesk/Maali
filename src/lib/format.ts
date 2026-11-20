// Formatting helpers (Indian numbering: lakh / crore).

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** ₹8,50,000 */
export const formatINR = (n: number) => `${n < 0 ? '−' : ''}₹${inr.format(Math.abs(Math.round(n)))}`

/** ₹2.85 Cr · ₹42.50 L · ₹85,000 */
export function formatCompact(n: number): string {
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`
  return `${sign}₹${inr.format(Math.round(a))}`
}

/** Axis ticks: 25L, 1.2Cr */
export function formatAxis(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e7) return `${+(n / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `${+(n / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${+(n / 1e3).toFixed(0)}K`
  return String(n)
}

export const formatPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-08-01' → '01-Aug-2026' */
export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Business time zone: "today" is the Indian calendar date, also on UTC servers. */
const TIME_ZONE = 'Asia/Kolkata'
const tzDate = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Demo snapshot used by the tests and docs/figures.json, so their figures never drift. */
export const DEMO_AS_OF_DATE = '2026-10-04'

/**
 * VITE_AS_OF_DATE=YYYY-MM-DD pins "today" (tests, figures script, demo snapshots);
 * unset or 'live' uses the real date in India. Read on every call so scripts can set it.
 */
function pinnedDate(): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_AS_OF_DATE
    ?? (typeof process !== 'undefined' ? process.env?.VITE_AS_OF_DATE : undefined)
  return env && env !== 'live' ? env : undefined
}

export const today = () => pinnedDate() ?? tzDate.format(new Date())

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return iso(d)
}

export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma) + 1
}
