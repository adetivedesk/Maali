import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { StoreProvider } from './store/store'
import { Guard, Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ClientDetail, Clients } from './pages/Clients'
import { Projects } from './pages/Projects'
import { ProjectDetail } from './pages/ProjectDetail'
import { Quotations, QuotationDetail } from './pages/Quotations'
import { Contracts } from './pages/Contracts'
import { Phases } from './pages/Phases'
import { PhaseDetail } from './pages/PhaseDetail'
import { Expenses } from './pages/Expenses'
import { SupplierDetail, Suppliers } from './pages/Suppliers'
import { Billing } from './pages/Billing'
import { Payments } from './pages/Payments'
import { Profitability } from './pages/Profitability'
import { Documents } from './pages/Documents'
import { ClosureReport, Reports } from './pages/Reports'
import { PrintInvoice, PrintQuotation, PrintReceipt } from './pages/Print'
import { UsersRoles } from './pages/admin/UsersRoles'
import { Activity } from './pages/admin/Activity'
import { Settings } from './pages/admin/Settings'
import type { MenuKey } from './lib/permissions'
import type { ReactNode } from 'react'

const g = (menu: MenuKey, el: ReactNode) => <Guard menu={menu}>{el}</Guard>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route path="print/quotation/:id" element={<PrintQuotation />} />
          <Route path="print/invoice/:id" element={<PrintInvoice />} />
          <Route path="print/receipt/:id" element={<PrintReceipt />} />
          <Route element={<Layout />}>
            <Route index element={g('dashboard', <Dashboard />)} />
            <Route path="clients" element={g('clients', <Clients />)} />
            <Route path="clients/:id" element={g('clients', <ClientDetail />)} />
            <Route path="projects" element={g('projects', <Projects />)} />
            <Route path="projects/:id" element={g('projects', <ProjectDetail />)} />
            <Route path="quotations" element={g('quotations', <Quotations />)} />
            <Route path="quotations/:id" element={g('quotations', <QuotationDetail />)} />
            <Route path="contracts" element={g('contracts', <Contracts />)} />
            <Route path="phases" element={g('phases', <Phases />)} />
            <Route path="phases/:id" element={g('phases', <PhaseDetail />)} />
            <Route path="expenses" element={g('expenses', <Expenses />)} />
            <Route path="suppliers" element={g('suppliers', <Suppliers />)} />
            <Route path="suppliers/:id" element={g('suppliers', <SupplierDetail />)} />
            <Route path="billing" element={g('billing', <Billing />)} />
            <Route path="payments" element={g('payments', <Payments />)} />
            <Route path="profitability" element={g('profitability', <Profitability />)} />
            <Route path="documents" element={g('documents', <Documents />)} />
            <Route path="reports" element={g('reports', <Reports />)} />
            <Route path="reports/closure/:id" element={g('reports', <ClosureReport />)} />
            <Route path="admin/users" element={g('users', <UsersRoles />)} />
            <Route path="admin/activity" element={g('activity', <Activity />)} />
            <Route path="admin/settings" element={g('settings', <Settings />)} />
            <Route path="*" element={g('dashboard', <Dashboard />)} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  </StrictMode>,
)
