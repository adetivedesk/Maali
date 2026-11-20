import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import {
  BarChart3, Building2, ChevronDown, ClipboardList, CreditCard, FileSignature, FileText, FolderKanban, History, KeyRound, Layers,
  LayoutDashboard, LogOut, Menu, Plus, Receipt, RotateCcw, Settings, ShieldCheck, ShieldX, TrendingUp, Truck, Users, Wallet, X,
} from 'lucide-react'
import type { MenuKey } from '../lib/permissions'
import { useStore } from '../store/store'
import { formatDate, today } from '../lib/format'
import { PasswordForm } from '../pages/Login'
import { Modal, ToastHost } from './ui'
import { ClientInvoiceForm, ClientPaymentForm, ExpenseForm, SupplierPaymentForm } from './forms'
import { ChangeOrderForm, QuotationForm } from './workflowForms'

const NAV: { to: string; label: string; icon: typeof Users; menu: MenuKey }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, menu: 'dashboard' },
  { to: '/clients', label: 'Clients', icon: Users, menu: 'clients' },
  { to: '/projects', label: 'Projects', icon: FolderKanban, menu: 'projects' },
  { to: '/quotations', label: 'Quotations', icon: ClipboardList, menu: 'quotations' },
  { to: '/contracts', label: 'Contracts', icon: FileSignature, menu: 'contracts' },
  { to: '/phases', label: 'Phases', icon: Layers, menu: 'phases' },
  { to: '/expenses', label: 'Expenses', icon: Receipt, menu: 'expenses' },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, menu: 'suppliers' },
  { to: '/billing', label: 'Client Billing', icon: CreditCard, menu: 'billing' },
  { to: '/payments', label: 'Payments', icon: Wallet, menu: 'payments' },
  { to: '/profitability', label: 'Profitability', icon: TrendingUp, menu: 'profitability' },
  { to: '/documents', label: 'Documents', icon: FileText, menu: 'documents' },
  { to: '/reports', label: 'Reports', icon: BarChart3, menu: 'reports' },
]

const ADMIN_NAV: typeof NAV = [
  { to: '/admin/users', label: 'Users & Roles', icon: ShieldCheck, menu: 'users' },
  { to: '/admin/activity', label: 'Activity Log', icon: History, menu: 'activity' },
  { to: '/admin/settings', label: 'Settings & Backup', icon: Settings, menu: 'settings' },
]

type QuickForm = 'expense' | 'supplierPayment' | 'clientInvoice' | 'clientPayment' | 'changeOrder' | 'quotation' | null

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

function NavItem({ n }: { n: (typeof NAV)[number] }) {
  return (
    <NavLink
      to={n.to}
      end={n.to === '/'}
      className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition', isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')}
    >
      {({ isActive }) => (<><n.icon size={17} className={isActive ? 'text-blue-400' : ''} />{n.label}</>)}
    </NavLink>
  )
}

export function Layout() {
  const { source, user, can, logout, resetLocal } = useStore()
  const [menu, setMenu] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [form, setForm] = useState<QuickForm>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const loc = useLocation()

  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0); setDrawer(false) }, [loc.pathname])
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const quick = ([
    { id: 'expense', label: 'Expense (material / labour / outsource)', menu: 'expenses' },
    { id: 'supplierPayment', label: 'Supplier payment', menu: 'payments' },
    { id: 'clientInvoice', label: 'Client invoice', menu: 'billing' },
    { id: 'clientPayment', label: 'Client payment', menu: 'payments' },
    { id: 'changeOrder', label: 'Change order', menu: 'projects' },
    { id: 'quotation', label: 'Quotation', menu: 'quotations' },
  ] as { id: Exclude<QuickForm, null>; label: string; menu: MenuKey }[]).filter((q) => can(q.menu, 'write'))
  const close = () => setForm(null)
  const nav = NAV.filter((n) => can(n.menu))
  const adminNav = source === 'cloud' ? ADMIN_NAV.filter((n) => can(n.menu)) : []

  return (
    <div className="flex h-full">
      {drawer && <div className="no-print fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setDrawer(false)} />}
      <aside className={clsx('fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-navy-950 text-slate-300 transition-transform duration-200 lg:static lg:w-60 lg:translate-x-0', drawer ? 'translate-x-0 shadow-2xl' : '-translate-x-full')}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Building2 size={19} /></div>
          <div>
            <div className="text-[15px] font-semibold leading-tight text-white">Maali Civil ERP</div>
            <div className="text-[11px] text-slate-400">Project & cost control</div>
          </div>
          <button type="button" onClick={() => setDrawer(false)} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-white/10 lg:hidden" aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {nav.map((n) => <NavItem key={n.to} n={n} />)}
          {adminNav.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Administration</div>
              {adminNav.map((n) => <NavItem key={n.to} n={n} />)}
            </>
          )}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-[11px] text-slate-500">
          <div className="font-medium text-slate-400">{source === 'cloud' ? 'Pilot · cloud database' : 'Demo mode'}</div>
          {source === 'cloud' ? `Signed in as ${user.username} (${user.roleName})` : 'Data is stored in this browser only.'}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setDrawer(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu size={20} /></button>
            <span className="truncate text-sm font-semibold text-navy-900 lg:hidden">Maali ERP</span>
            <span className="hidden text-sm text-slate-500 lg:inline">FY 2026–27 · Today {formatDate(today())} · All amounts in INR</span>
          </div>
          <div className="flex items-center gap-2">
            {source === 'local' && (
              <button type="button" onClick={() => { if (window.confirm('Reset all demo data? Changes made in this browser will be lost.')) resetLocal() }} title="Reset demo data" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 sm:px-3">
                <RotateCcw size={13} /><span className="hidden sm:inline">Reset demo data</span>
              </button>
            )}
            {quick.length > 0 && (
              <div className="relative" ref={menuRef}>
                <button type="button" onClick={() => setMenu(!menu)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 sm:px-3.5">
                  <Plus size={16} /><span className="hidden sm:inline">Quick add</span> <ChevronDown size={14} />
                </button>
                {menu && (
                  <div className="absolute right-0 top-11 z-40 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                    {quick.map((q) => (
                      <button key={q.id} type="button" onClick={() => { setForm(q.id); setMenu(false) }} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">{q.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="relative ml-1 sm:ml-2" ref={userRef}>
              <button type="button" onClick={() => setUserMenu(!userMenu)} className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white hover:ring-2 hover:ring-blue-300" title={`${user.name} · ${user.roleName}`} aria-label="Account menu">
                {initials(user.name)}
              </button>
              {userMenu && (
                <div className="absolute right-0 top-11 z-40 w-64 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                  <div className="border-b border-slate-100 px-4 pb-2.5 pt-1.5">
                    <div className="text-sm font-semibold text-navy-900">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.username} · {user.roleName}</div>
                  </div>
                  {source === 'cloud' && (
                    <>
                      <button type="button" onClick={() => { setPwOpen(true); setUserMenu(false) }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><KeyRound size={15} /> Change password</button>
                      <button type="button" onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><LogOut size={15} /> Sign out</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>

      <ExpenseForm open={form === 'expense'} onClose={close} />
      <SupplierPaymentForm open={form === 'supplierPayment'} onClose={close} />
      <ClientInvoiceForm open={form === 'clientInvoice'} onClose={close} />
      <ClientPaymentForm open={form === 'clientPayment'} onClose={close} />
      <ChangeOrderForm open={form === 'changeOrder'} onClose={close} />
      <QuotationForm open={form === 'quotation'} onClose={close} />
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change password" subtitle="You will stay signed in here; other devices are signed out." width="max-w-sm">
        <PasswordForm onDone={() => setPwOpen(false)} />
      </Modal>
      <ToastHost />
    </div>
  )
}

/** Route guard: shows the page only if the user's role can read its menu. */
export function Guard({ menu, children }: { menu: MenuKey; children: ReactNode }) {
  const { can, user } = useStore()
  if (can(menu)) return <>{children}</>
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <ShieldX className="mx-auto text-slate-400" size={32} />
      <h1 className="mt-3 text-base font-semibold text-navy-900">No access</h1>
      <p className="mt-1 text-sm text-slate-500">Your role ({user.roleName}) does not include this screen. Ask an administrator if you need it.</p>
    </div>
  )
}
