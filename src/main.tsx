import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { StoreProvider } from './store/store'
import { Layout } from './components/Layout'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="quotations" element={<Quotations />} />
            <Route path="quotations/:id" element={<QuotationDetail />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="phases" element={<Phases />} />
            <Route path="phases/:id" element={<PhaseDetail />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="suppliers/:id" element={<SupplierDetail />} />
            <Route path="billing" element={<Billing />} />
            <Route path="payments" element={<Payments />} />
            <Route path="profitability" element={<Profitability />} />
            <Route path="documents" element={<Documents />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/closure/:id" element={<ClosureReport />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  </StrictMode>,
)
