import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import {
  BarChart3, Building2, ChevronDown, ClipboardList, CreditCard, FileSignature, FileText, FolderKanban, Layers,
  LayoutDashboard, Plus, Receipt, RotateCcw, TrendingUp, Truck, Users, Wallet,
} from 'lucide-react'
import { useStore } from '../store/store'
import { ToastHost } from './ui'
import { ClientInvoiceForm, ClientPaymentForm, ExpenseForm, SupplierPaymentForm } from './forms'
import { ChangeOrderForm, QuotationForm } from './workflowForms'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/quotations', label: 'Quotations', icon: ClipboardList },
  { to: '/contracts', label: 'Contracts', icon: FileSignature },
  { to: '/phases', label: 'Phases', icon: Layers },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/billing', label: 'Client Billing', icon: CreditCard },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/profitability', label: 'Profitability', icon: TrendingUp },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

type QuickForm = 'expense' | 'supplierPayment' | 'clientInvoice' | 'clientPayment' | 'changeOrder' | 'quotation' | null

export function Layout() {
  const { reset } = useStore()
  const [menu, setMenu] = useState(false)
  const [form, setForm] = useState<QuickForm>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const loc = useLocation()

  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    const h = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const quick: { id: Exclude<QuickForm, null>; label: string }[] = [
    { id: 'expense', label: 'Expense (material / labour / outsource)' },
    { id: 'supplierPayment', label: 'Supplier payment' },
    { id: 'clientInvoice', label: 'Client invoice' },
    { id: 'clientPayment', label: 'Client payment' },
    { id: 'changeOrder', label: 'Change order' },
    { id: 'quotation', label: 'Quotation' },
  ]
  const close = () => setForm(null)

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col bg-navy-950 text-slate-300">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white"><Building2 size={19} /></div>
          <div>
            <div className="text-[15px] font-semibold leading-tight text-white">Maali Civil ERP</div>
            <div className="text-[11px] text-slate-400">Project & cost control</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition', isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')}
            >
              {({ isActive }) => (<><n.icon size={17} className={isActive ? 'text-blue-400' : ''} />{n.label}</>)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-[11px] text-slate-500">
          <div className="font-medium text-slate-400">Demo mode</div>
          Data is stored in this browser only.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="text-sm text-slate-500">FY 2026–27 · All amounts in INR</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { if (window.confirm('Reset all demo data? Changes made in this browser will be lost.')) reset() }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
              <RotateCcw size={13} /> Reset demo data
            </button>
            <div className="relative" ref={menuRef}>
              <button type="button" onClick={() => setMenu(!menu)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
                <Plus size={16} /> Quick add <ChevronDown size={14} />
              </button>
              {menu && (
                <div className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                  {quick.map((q) => (
                    <button key={q.id} type="button" onClick={() => { setForm(q.id); setMenu(false) }} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">{q.label}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white" title="Admin">AD</div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-8 py-7">
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
      <ToastHost />
    </div>
  )
}
