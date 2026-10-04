import type {
  ClientInvoice, ClientPayment, Database, Expense, PaymentMethod, Phase, PhaseBudget, SupplierInvoice, SupplierPayment,
} from './types'

// ---------------------------------------------------------------------------
// Demo seed. Only primary facts are stored; every total is derived in calc.ts.
// Supplier invoice amounts = sum of their linked expenses.
// ---------------------------------------------------------------------------

const P1 = 'PRJ-2026-001' // ABC Residential Villa
const P2 = 'PRJ-2026-002' // Green Valley Commercial
const P3 = 'PRJ-2026-003' // SRK Warehouse

const budget = (material: number, labour: number, outsource: number, other: number): PhaseBudget => ({ material, labour, outsource, other })

const phases: Phase[] = [
  // ABC Villa — ₹50L original + ₹5L change order
  { id: 'PH-001', projectId: P1, sequence: 1, name: 'Foundation', contractValue: 800000, budget: budget(220000, 130000, 200000, 0), status: 'Billed', progress: 100, startDate: '2026-08-01', endDate: '2026-08-31' },
  { id: 'PH-002', projectId: P1, sequence: 2, name: 'Structure', contractValue: 1500000, budget: budget(550000, 260000, 160000, 30000), status: 'In Progress', progress: 70, startDate: '2026-09-01', endDate: '2026-10-31' },
  { id: 'PH-003', projectId: P1, sequence: 3, name: 'Electrical & Plumbing', contractValue: 700000, budget: budget(250000, 100000, 90000, 10000), status: 'In Progress', progress: 20, startDate: '2026-09-20', endDate: '2026-11-30' },
  { id: 'PH-004', projectId: P1, sequence: 4, name: 'Finishing', contractValue: 2000000, budget: budget(700000, 300000, 350000, 50000), status: 'Planned', progress: 0, startDate: '2026-11-15', endDate: '2027-01-31' },
  { id: 'PH-005', projectId: P1, sequence: 5, name: 'Compound Wall (CO-2026-001)', contractValue: 500000, budget: budget(150000, 90000, 50000, 10000), status: 'Planned', progress: 0, startDate: '2026-12-01', endDate: '2027-01-15', changeOrderId: 'CO-001' },
  // Green Valley — ₹82.5L
  { id: 'PH-006', projectId: P2, sequence: 1, name: 'Site Preparation & Piling', contractValue: 1200000, budget: budget(300000, 120000, 380000, 20000), status: 'Payment Received', progress: 100, startDate: '2026-07-15', endDate: '2026-08-15' },
  { id: 'PH-007', projectId: P2, sequence: 2, name: 'Foundation & Basement', contractValue: 1800000, budget: budget(650000, 250000, 250000, 50000), status: 'Completed', progress: 100, startDate: '2026-08-16', endDate: '2026-09-20' },
  { id: 'PH-008', projectId: P2, sequence: 3, name: 'Superstructure (G+3)', contractValue: 3000000, budget: budget(1100000, 450000, 400000, 50000), status: 'In Progress', progress: 30, startDate: '2026-09-15', endDate: '2026-12-31' },
  { id: 'PH-009', projectId: P2, sequence: 4, name: 'MEP Services', contractValue: 1000000, budget: budget(350000, 150000, 150000, 0), status: 'Planned', progress: 0, startDate: '2027-01-01', endDate: '2027-02-28' },
  { id: 'PH-010', projectId: P2, sequence: 5, name: 'Facade & Finishing', contractValue: 1250000, budget: budget(400000, 200000, 200000, 30000), status: 'Planned', progress: 0, startDate: '2027-02-15', endDate: '2027-04-30' },
  // SRK Warehouse — ₹35L original + ₹3L change order
  { id: 'PH-011', projectId: P3, sequence: 1, name: 'Earthwork & Foundation', contractValue: 700000, budget: budget(220000, 100000, 160000, 20000), status: 'Payment Received', progress: 100, startDate: '2026-02-01', endDate: '2026-03-15' },
  { id: 'PH-012', projectId: P3, sequence: 2, name: 'Steel Structure (PEB)', contractValue: 1500000, budget: budget(650000, 120000, 250000, 30000), status: 'Payment Received', progress: 100, startDate: '2026-03-16', endDate: '2026-06-30' },
  { id: 'PH-013', projectId: P3, sequence: 3, name: 'Flooring & Roofing', contractValue: 900000, budget: budget(350000, 120000, 130000, 20000), status: 'Payment Received', progress: 100, startDate: '2026-07-01', endDate: '2026-08-15' },
  { id: 'PH-014', projectId: P3, sequence: 4, name: 'Electrical & Drainage', contractValue: 400000, budget: budget(140000, 60000, 50000, 10000), status: 'Billed', progress: 100, startDate: '2026-08-16', endDate: '2026-09-30' },
  { id: 'PH-015', projectId: P3, sequence: 5, name: 'Loading Dock Ramp (CO-2026-003)', contractValue: 300000, budget: budget(100000, 50000, 40000, 10000), status: 'Payment Received', progress: 100, startDate: '2026-06-15', endDate: '2026-07-20', changeOrderId: 'CO-003' },
]

const projectOf = (phaseId: string) => phases.find((p) => p.id === phaseId)!.projectId

// --- expense builders --------------------------------------------------------
let expSeq = 0
const nextExp = () => `EXP-${String(++expSeq).padStart(3, '0')}`

const mat = (phaseId: string, subType: string, description: string, quantity: number, unit: string, rate: number, supplierId: string, supplierInvoiceId: string, date: string): Expense => ({
  id: nextExp(), projectId: projectOf(phaseId), phaseId, category: 'material', subType, description, quantity, unit, rate, amount: quantity * rate, supplierId, supplierInvoiceId, date,
})
const lab = (phaseId: string, subType: string, workerName: string, dailyRate: number, days: number, date: string): Expense => ({
  id: nextExp(), projectId: projectOf(phaseId), phaseId, category: 'labour', subType, description: `${subType} — ${workerName}`, workerName, dailyRate, days, amount: dailyRate * days, date,
})
const outFixed = (phaseId: string, subType: string, description: string, amount: number, supplierId: string, supplierInvoiceId: string, date: string): Expense => ({
  id: nextExp(), projectId: projectOf(phaseId), phaseId, category: 'outsource', subType, description, basis: 'fixed', quantity: 1, unit: 'Fixed', rate: amount, amount, supplierId, supplierInvoiceId, date,
})
const outRate = (phaseId: string, subType: string, description: string, quantity: number, unit: string, rate: number, supplierId: string, supplierInvoiceId: string, date: string): Expense => ({
  id: nextExp(), projectId: projectOf(phaseId), phaseId, category: 'outsource', subType, description, basis: 'rate', quantity, unit, rate, amount: quantity * rate, supplierId, supplierInvoiceId, date,
})
const other = (phaseId: string, subType: string, description: string, amount: number, date: string): Expense => ({
  id: nextExp(), projectId: projectOf(phaseId), phaseId, category: 'other', subType, description, amount, date,
})

const expenses: Expense[] = [
  // ---- ABC Villa · Foundation (actual ₹5,10,000) ----
  mat('PH-001', 'Cement', 'OPC 53 grade cement', 250, 'Bags', 420, 'SUP-001', 'SIN-001', '2026-08-04'),
  mat('PH-001', 'Steel', 'TMT Fe550 bars 12mm', 1500, 'Kg', 70, 'SUP-002', 'SIN-002', '2026-08-06'),
  lab('PH-001', 'Mason', 'Murugan', 1200, 25, '2026-08-31'),
  lab('PH-001', 'Mason', 'Selvam', 1200, 25, '2026-08-31'),
  lab('PH-001', 'Helper', 'Karthik', 800, 25, '2026-08-31'),
  lab('PH-001', 'Helper', 'Ravi', 800, 25, '2026-08-31'),
  lab('PH-001', 'Supervisor', 'Senthil', 2000, 10, '2026-08-31'),
  outFixed('PH-001', 'Excavation', 'Foundation excavation — fixed contract', 150000, 'SUP-003', 'SIN-003', '2026-08-03'),
  outRate('PH-001', 'Equipment Rental', 'JCB excavator hire', 12, 'Day', 2500, 'SUP-007', 'SIN-004', '2026-08-14'),
  // ---- ABC Villa · Structure ----
  mat('PH-002', 'Cement', 'OPC 53 grade cement', 600, 'Bags', 420, 'SUP-001', 'SIN-005', '2026-09-03'),
  mat('PH-002', 'Steel', 'TMT Fe550 bars 8–16mm', 3200, 'Kg', 68, 'SUP-002', 'SIN-006', '2026-09-05'),
  mat('PH-002', 'Bricks', 'Wire-cut red bricks', 12000, 'Nos', 9, 'SUP-005', 'SIN-007', '2026-09-12'),
  lab('PH-002', 'Mason', 'Murugan', 1200, 30, '2026-09-30'),
  lab('PH-002', 'Mason', 'Selvam', 1200, 30, '2026-09-30'),
  lab('PH-002', 'Helper', 'Karthik', 800, 30, '2026-09-30'),
  lab('PH-002', 'Helper', 'Ravi', 800, 28, '2026-09-30'),
  lab('PH-002', 'Other Labour', 'Gopal (Bar bender)', 1100, 20, '2026-09-30'),
  outRate('PH-002', 'Specialist Contractor', 'Centering & shuttering for slabs', 2400, 'Sq.ft', 45, 'SUP-006', 'SIN-008', '2026-09-18'),
  // ---- ABC Villa · Electrical & Plumbing ----
  mat('PH-003', 'Electrical Materials', 'Conduits, boxes & FR wiring', 1, 'Lot', 68000, 'SUP-004', 'SIN-009', '2026-09-24'),
  mat('PH-003', 'Plumbing Materials', 'CPVC / UPVC pipes & fittings', 1, 'Lot', 42000, 'SUP-005', 'SIN-010', '2026-09-26'),
  lab('PH-003', 'Electrician', 'Babu', 1100, 8, '2026-09-30'),
  lab('PH-003', 'Plumber', 'Joseph', 1100, 6, '2026-09-30'),

  // ---- Green Valley · Site Preparation & Piling ----
  mat('PH-006', 'Sand', 'M-sand for PCC', 60, 'Cu.m', 1800, 'SUP-005', 'SIN-011', '2026-07-18'),
  mat('PH-006', 'Steel', 'Pile reinforcement cages', 2800, 'Kg', 68, 'SUP-002', 'SIN-012', '2026-07-20'),
  lab('PH-006', 'Helper', 'Pandi', 800, 30, '2026-08-15'),
  lab('PH-006', 'Mason', 'Kannan', 1200, 30, '2026-08-15'),
  lab('PH-006', 'Supervisor', 'Ibrahim', 2000, 25, '2026-08-15'),
  outFixed('PH-006', 'Excavation', 'Bulk excavation & site levelling', 220000, 'SUP-003', 'SIN-013', '2026-07-22'),
  outRate('PH-006', 'Specialist Contractor', 'Bored cast-in-situ piling', 400, 'Running ft', 400, 'SUP-003', 'SIN-014', '2026-08-04'),
  other('PH-006', 'Survey & Testing', 'Topographic survey & soil investigation', 18000, '2026-07-16'),
  // ---- Green Valley · Foundation & Basement ----
  mat('PH-007', 'Cement', 'OPC 53 grade cement', 900, 'Bags', 410, 'SUP-001', 'SIN-015', '2026-08-18'),
  mat('PH-007', 'Steel', 'TMT Fe550 bars 12–25mm', 4000, 'Kg', 67, 'SUP-002', 'SIN-016', '2026-08-20'),
  lab('PH-007', 'Mason', 'Kannan', 1200, 40, '2026-09-20'),
  lab('PH-007', 'Mason', 'Velu', 1200, 40, '2026-09-20'),
  lab('PH-007', 'Helper', 'Pandi', 800, 40, '2026-09-20'),
  lab('PH-007', 'Helper', 'Muthu', 800, 40, '2026-09-20'),
  lab('PH-007', 'Supervisor', 'Ibrahim', 2000, 35, '2026-09-20'),
  outRate('PH-007', 'Specialist Contractor', 'Basement waterproofing membrane', 3200, 'Sq.ft', 35, 'SUP-006', 'SIN-017', '2026-08-30'),
  outRate('PH-007', 'Equipment Rental', 'Concrete boom pump hire', 15, 'Day', 9000, 'SUP-007', 'SIN-018', '2026-09-04'),
  other('PH-007', 'Site Utilities', 'Curing water tanker supply', 32000, '2026-09-18'),
  // ---- Green Valley · Superstructure ----
  mat('PH-008', 'Cement', 'OPC 53 grade cement', 700, 'Bags', 415, 'SUP-001', 'SIN-019', '2026-09-17'),
  mat('PH-008', 'Bricks', 'Fly-ash bricks', 20000, 'Nos', 9, 'SUP-005', 'SIN-020', '2026-09-19'),
  lab('PH-008', 'Mason', 'Velu', 1200, 20, '2026-09-30'),
  lab('PH-008', 'Helper', 'Muthu', 800, 20, '2026-09-30'),
  outRate('PH-008', 'Specialist Contractor', 'Centering & shuttering — 1st floor', 4500, 'Sq.ft', 42, 'SUP-006', 'SIN-021', '2026-09-24'),

  // ---- SRK Warehouse · Earthwork & Foundation ----
  mat('PH-011', 'Cement', 'PPC cement', 400, 'Bags', 400, 'SUP-001', 'SIN-022', '2026-02-12'),
  mat('PH-011', 'Sand', 'River sand', 30, 'Cu.m', 1800, 'SUP-005', 'SIN-023', '2026-02-15'),
  lab('PH-011', 'Mason', 'Arjun', 1200, 35, '2026-03-15'),
  lab('PH-011', 'Helper', 'Siva', 800, 35, '2026-03-15'),
  lab('PH-011', 'Helper', 'Mani', 800, 35, '2026-03-15'),
  outFixed('PH-011', 'Excavation', 'Earthwork excavation — fixed contract', 150000, 'SUP-003', 'SIN-024', '2026-02-05'),
  other('PH-011', 'Survey & Testing', 'Soil bearing capacity test', 15000, '2026-02-02'),
  // ---- SRK Warehouse · Steel Structure (PEB) ----
  mat('PH-012', 'Steel', 'PEB primary & secondary members', 9500, 'Kg', 70, 'SUP-002', 'SIN-025', '2026-04-08'),
  lab('PH-012', 'Other Labour', 'Ramesh (Welder)', 1300, 40, '2026-06-30'),
  lab('PH-012', 'Helper', 'Siva', 800, 40, '2026-06-30'),
  lab('PH-012', 'Supervisor', 'Dinesh', 2000, 30, '2026-06-30'),
  outRate('PH-012', 'Fabrication', 'PEB erection & fabrication', 12000, 'Sq.ft', 18, 'SUP-006', 'SIN-026', '2026-05-18'),
  outRate('PH-012', 'Equipment Rental', '25T crane hire for erection', 8, 'Day', 6000, 'SUP-007', 'SIN-027', '2026-05-22'),
  other('PH-012', 'Site Security', 'Site security services', 25000, '2026-06-30'),
  // ---- SRK Warehouse · Flooring & Roofing ----
  mat('PH-013', 'Cement', 'OPC 53 grade cement', 500, 'Bags', 405, 'SUP-001', 'SIN-028', '2026-07-08'),
  mat('PH-013', 'Other Materials', 'Galvalume roofing sheets', 1, 'Lot', 140000, 'SUP-002', 'SIN-029', '2026-07-12'),
  lab('PH-013', 'Mason', 'Arjun', 1200, 30, '2026-08-15'),
  lab('PH-013', 'Helper', 'Mani', 800, 30, '2026-08-15'),
  lab('PH-013', 'Mason', 'Raja', 1200, 30, '2026-08-15'),
  outRate('PH-013', 'Specialist Contractor', 'Trimix flooring with hardener', 12000, 'Sq.ft', 11, 'SUP-006', 'SIN-030', '2026-07-30'),
  // ---- SRK Warehouse · Electrical & Drainage ----
  mat('PH-014', 'Electrical Materials', 'LT panel, cables & high-bay fittings', 1, 'Lot', 120000, 'SUP-004', 'SIN-031', '2026-08-22'),
  lab('PH-014', 'Electrician', 'Babu', 1100, 25, '2026-09-30'),
  lab('PH-014', 'Plumber', 'Joseph', 1100, 20, '2026-09-30'),
  outFixed('PH-014', 'Specialist Contractor', 'Electrical installation & testing', 45000, 'SUP-004', 'SIN-031', '2026-08-22'),
  // ---- SRK Warehouse · Loading Dock Ramp (change order) ----
  mat('PH-015', 'Cement', 'OPC 53 grade cement', 150, 'Bags', 405, 'SUP-001', 'SIN-032', '2026-06-18'),
  mat('PH-015', 'Steel', 'TMT Fe550 bars 10mm', 600, 'Kg', 68, 'SUP-002', 'SIN-033', '2026-06-20'),
  lab('PH-015', 'Mason', 'Raja', 1200, 20, '2026-07-20'),
  lab('PH-015', 'Helper', 'Mani', 800, 20, '2026-07-20'),
  outFixed('PH-015', 'Transport', 'Material transport & debris removal', 22000, 'SUP-007', 'SIN-034', '2026-06-24'),
]

// --- supplier invoices -------------------------------------------------------
const sin = (id: string, supplierId: string, projectId: string, invoiceNumber: string, invoiceDate: string, dueDate: string): SupplierInvoice =>
  ({ id, supplierId, projectId, invoiceNumber, invoiceDate, dueDate })

const supplierInvoices: SupplierInvoice[] = [
  sin('SIN-001', 'SUP-001', P1, 'SLC/26/0412', '2026-08-04', '2026-09-03'),
  sin('SIN-002', 'SUP-002', P1, 'KST-2291', '2026-08-06', '2026-09-05'),
  sin('SIN-003', 'SUP-003', P1, 'SES/078', '2026-08-03', '2026-09-02'),
  sin('SIN-004', 'SUP-007', P1, 'CER-1145', '2026-08-14', '2026-09-13'),
  sin('SIN-005', 'SUP-001', P1, 'SLC/26/0488', '2026-09-03', '2026-10-15'),
  sin('SIN-006', 'SUP-002', P1, 'KST-2350', '2026-09-05', '2026-09-30'),
  sin('SIN-007', 'SUP-005', P1, 'ABM/26/331', '2026-09-12', '2026-10-20'),
  sin('SIN-008', 'SUP-006', P1, 'VMC-0217', '2026-09-18', '2026-10-18'),
  sin('SIN-009', 'SUP-004', P1, 'REW/26/093', '2026-09-24', '2026-10-25'),
  sin('SIN-010', 'SUP-005', P1, 'ABM/26/347', '2026-09-26', '2026-10-30'),
  sin('SIN-011', 'SUP-005', P2, 'ABM/26/240', '2026-07-18', '2026-08-17'),
  sin('SIN-012', 'SUP-002', P2, 'KST-2204', '2026-07-20', '2026-08-19'),
  sin('SIN-013', 'SUP-003', P2, 'SES/071', '2026-07-22', '2026-08-21'),
  sin('SIN-014', 'SUP-003', P2, 'SES/076', '2026-08-04', '2026-09-03'),
  sin('SIN-015', 'SUP-001', P2, 'SLC/26/0430', '2026-08-18', '2026-09-17'),
  sin('SIN-016', 'SUP-002', P2, 'KST-2276', '2026-08-20', '2026-09-19'),
  sin('SIN-017', 'SUP-006', P2, 'VMC-0204', '2026-08-30', '2026-09-29'),
  sin('SIN-018', 'SUP-007', P2, 'CER-1162', '2026-09-04', '2026-10-04'),
  sin('SIN-019', 'SUP-001', P2, 'SLC/26/0502', '2026-09-17', '2026-10-17'),
  sin('SIN-020', 'SUP-005', P2, 'ABM/26/338', '2026-09-19', '2026-10-19'),
  sin('SIN-021', 'SUP-006', P2, 'VMC-0222', '2026-09-24', '2026-10-24'),
  sin('SIN-022', 'SUP-001', P3, 'SLC/26/0088', '2026-02-12', '2026-03-14'),
  sin('SIN-023', 'SUP-005', P3, 'ABM/26/041', '2026-02-15', '2026-03-17'),
  sin('SIN-024', 'SUP-003', P3, 'SES/012', '2026-02-05', '2026-03-07'),
  sin('SIN-025', 'SUP-002', P3, 'KST-1890', '2026-04-08', '2026-05-08'),
  sin('SIN-026', 'SUP-006', P3, 'VMC-0115', '2026-05-18', '2026-06-17'),
  sin('SIN-027', 'SUP-007', P3, 'CER-0960', '2026-05-22', '2026-06-21'),
  sin('SIN-028', 'SUP-001', P3, 'SLC/26/0301', '2026-07-08', '2026-08-07'),
  sin('SIN-029', 'SUP-002', P3, 'KST-2150', '2026-07-12', '2026-08-11'),
  sin('SIN-030', 'SUP-006', P3, 'VMC-0181', '2026-07-30', '2026-08-29'),
  sin('SIN-031', 'SUP-004', P3, 'REW/26/071', '2026-08-22', '2026-09-21'),
  sin('SIN-032', 'SUP-001', P3, 'SLC/26/0244', '2026-06-18', '2026-07-18'),
  sin('SIN-033', 'SUP-002', P3, 'KST-2071', '2026-06-20', '2026-07-20'),
  sin('SIN-034', 'SUP-007', P3, 'CER-1021', '2026-06-24', '2026-07-24'),
]

let spaySeq = 0
const spay = (supplierInvoiceId: string, date: string, amount: number, method: PaymentMethod = 'Bank Transfer', reference?: string): SupplierPayment => {
  const id = `SPAY-${String(++spaySeq).padStart(3, '0')}`
  return { id, supplierInvoiceId, date, amount, method, reference: reference ?? `NEFT/${date.replaceAll('-', '').slice(2)}/${spaySeq}` }
}

const supplierPayments: SupplierPayment[] = [
  spay('SIN-001', '2026-08-20', 105000),
  spay('SIN-002', '2026-08-25', 50000),
  spay('SIN-002', '2026-09-10', 55000, 'Cheque', 'CHQ-004512'),
  spay('SIN-003', '2026-08-15', 100000),
  spay('SIN-003', '2026-09-05', 50000),
  spay('SIN-004', '2026-08-28', 30000, 'Cash', 'CASH-0812'),
  spay('SIN-005', '2026-09-20', 150000),
  spay('SIN-006', '2026-09-28', 100000),
  spay('SIN-008', '2026-09-30', 54000),
  spay('SIN-011', '2026-08-10', 108000),
  spay('SIN-012', '2026-08-18', 190400),
  spay('SIN-013', '2026-08-05', 120000),
  spay('SIN-013', '2026-08-28', 100000, 'Cheque', 'CHQ-004488'),
  spay('SIN-014', '2026-09-02', 160000),
  spay('SIN-015', '2026-09-15', 200000),
  spay('SIN-016', '2026-09-19', 268000),
  spay('SIN-018', '2026-09-25', 70000),
  spay('SIN-020', '2026-09-30', 90000),
  spay('SIN-022', '2026-03-10', 160000),
  spay('SIN-023', '2026-03-12', 54000),
  spay('SIN-024', '2026-03-05', 150000),
  spay('SIN-025', '2026-05-05', 400000),
  spay('SIN-025', '2026-06-02', 265000),
  spay('SIN-026', '2026-06-15', 216000),
  spay('SIN-027', '2026-06-20', 48000),
  spay('SIN-028', '2026-08-05', 202500),
  spay('SIN-029', '2026-08-10', 140000),
  spay('SIN-030', '2026-08-28', 100000),
  spay('SIN-031', '2026-09-20', 100000),
  spay('SIN-032', '2026-07-15', 60750),
  spay('SIN-033', '2026-07-18', 40800),
  spay('SIN-034', '2026-07-20', 22000, 'Cash', 'CASH-0720'),
]

// --- client invoices & payments ---------------------------------------------
const cinv = (n: number, projectId: string, phaseId: string, description: string, invoiceDate: string, dueDate: string, amount: number): ClientInvoice => ({
  id: `CINV-${String(n).padStart(3, '0')}`, invoiceNumber: `INV-2026-${String(n).padStart(3, '0')}`, projectId, phaseId, description, invoiceDate, dueDate, amount,
})

const clientInvoices: ClientInvoice[] = [
  cinv(1, P3, 'PH-011', 'Earthwork & Foundation — final bill', '2026-03-20', '2026-04-04', 700000),
  cinv(2, P3, 'PH-012', 'Steel Structure — running bill 1 (50%)', '2026-05-15', '2026-05-30', 750000),
  cinv(3, P3, 'PH-012', 'Steel Structure — final bill', '2026-07-05', '2026-07-20', 750000),
  cinv(4, P3, 'PH-015', 'CO-2026-003 Loading dock ramp', '2026-07-25', '2026-08-09', 300000),
  cinv(5, P3, 'PH-013', 'Flooring & Roofing — final bill', '2026-08-18', '2026-09-02', 900000),
  cinv(6, P2, 'PH-006', 'Site Preparation & Piling — final bill', '2026-08-20', '2026-09-04', 1200000),
  cinv(7, P1, 'PH-001', 'Foundation — final bill', '2026-09-02', '2026-09-17', 800000),
  cinv(8, P2, 'PH-008', 'Superstructure — running bill 1 (30%)', '2026-09-20', '2026-10-05', 900000),
  cinv(9, P1, 'PH-002', 'Structure — running bill 1 (50%)', '2026-09-25', '2026-10-10', 750000),
  cinv(10, P3, 'PH-014', 'Electrical & Drainage — final bill', '2026-09-30', '2026-10-15', 400000),
]

let paySeq = 0
const cpay = (clientInvoiceId: string, date: string, amount: number, method: PaymentMethod, reference: string): ClientPayment =>
  ({ id: `PAY-${String(++paySeq).padStart(3, '0')}`, clientInvoiceId, date, amount, method, reference })

const clientPayments: ClientPayment[] = [
  cpay('CINV-001', '2026-03-28', 350000, 'Bank Transfer', 'UTR SBIN26087123'),
  cpay('CINV-001', '2026-04-10', 350000, 'Cheque', 'CHQ-118204'),
  cpay('CINV-002', '2026-05-28', 750000, 'Bank Transfer', 'UTR HDFC26148870'),
  cpay('CINV-003', '2026-07-18', 500000, 'Bank Transfer', 'UTR HDFC26199014'),
  cpay('CINV-003', '2026-07-30', 250000, 'Cheque', 'CHQ-118377'),
  cpay('CINV-004', '2026-08-05', 300000, 'Bank Transfer', 'UTR HDFC26217532'),
  cpay('CINV-005', '2026-08-28', 400000, 'Bank Transfer', 'UTR SBIN26240561'),
  cpay('CINV-005', '2026-09-15', 500000, 'Bank Transfer', 'UTR SBIN26258802'),
  cpay('CINV-006', '2026-08-30', 600000, 'Bank Transfer', 'UTR ICIC26242019'),
  cpay('CINV-006', '2026-09-12', 600000, 'Bank Transfer', 'UTR ICIC26255230'),
  cpay('CINV-007', '2026-09-10', 400000, 'Bank Transfer', 'UTR AXIS26253318'),
  cpay('CINV-007', '2026-09-25', 200000, 'Cheque', 'CHQ-503117'),
  cpay('CINV-008', '2026-09-30', 400000, 'Bank Transfer', 'UTR ICIC26273871'),
  cpay('CINV-009', '2026-10-01', 300000, 'Bank Transfer', 'UTR AXIS26274402'),
  cpay('CINV-010', '2026-10-03', 150000, 'Bank Transfer', 'UTR HDFC26276115'),
]

export function createSeed(): Database {
  // Deep copy so callers (Reset demo data, tests) never share mutable objects.
  return structuredClone(seedData())
}

function seedData(): Database {
  return {
    clients: [
      { id: 'CLI-001', name: 'ABC Builders Pvt Ltd', contactPerson: 'Rajesh Kumar', phone: '+91 98765 43210', email: 'projects@abcbuilders.in', city: 'Chennai', state: 'Tamil Nadu', createdAt: '2026-06-10' },
      { id: 'CLI-002', name: 'Green Valley Developers', contactPerson: 'Mohamed Faisal', phone: '+91 98421 55678', email: 'projects@greenvalley.in', city: 'Madurai', state: 'Tamil Nadu', createdAt: '2026-05-22' },
      { id: 'CLI-003', name: 'SRK Infrastructure', contactPerson: 'Suresh Raj', phone: '+91 97890 22334', email: 'projects@srkinfra.in', city: 'Coimbatore', state: 'Tamil Nadu', createdAt: '2026-01-05' },
      { id: 'CLI-004', name: 'Meenakshi Healthcare Trust', contactPerson: 'Dr. Lakshmi Narayanan', phone: '+91 94430 77812', email: 'admin@meenakshihealth.org', city: 'Tiruchirappalli', state: 'Tamil Nadu', createdAt: '2026-09-02' },
      { id: 'CLI-005', name: 'Coastal Logistics Parks', contactPerson: 'Antony Fernando', phone: '+91 90031 45567', email: 'infra@coastallogistics.in', city: 'Thoothukudi', state: 'Tamil Nadu', createdAt: '2026-09-05' },
      { id: 'CLI-006', name: 'Sri Sai Ram Educational Trust', contactPerson: 'K. Balasubramanian', phone: '+91 98940 11203', email: 'trust@sairamedu.in', city: 'Salem', state: 'Tamil Nadu', createdAt: '2026-04-18' },
    ],
    projects: [
      { id: P1, name: 'ABC Residential Villa – Chennai', shortName: 'ABC Villa', clientId: 'CLI-001', quotationId: 'QT-2026-001', location: 'Chennai, Tamil Nadu', status: 'Active', contractValue: 5000000, startDate: '2026-08-01', endDate: '2027-01-31', projectManager: 'Eng. Arun Kumar', description: 'G+1 independent residential villa, 4,800 sq.ft built-up.' },
      { id: P2, name: 'Green Valley Commercial Building', shortName: 'Green Valley', clientId: 'CLI-002', quotationId: 'QT-2026-002', location: 'Madurai, Tamil Nadu', status: 'Active', contractValue: 8250000, startDate: '2026-07-15', endDate: '2027-04-30', projectManager: 'Eng. Mohammed Irfan', description: 'Basement + G+3 commercial complex, 18,000 sq.ft.' },
      { id: P3, name: 'SRK Warehouse Development', shortName: 'SRK Warehouse', clientId: 'CLI-003', quotationId: 'QT-2026-003', location: 'Coimbatore, Tamil Nadu', status: 'Completed', contractValue: 3500000, startDate: '2026-02-01', endDate: '2026-09-30', projectManager: 'Eng. Prakash', description: 'Pre-engineered steel warehouse, 12,000 sq.ft with loading dock.' },
    ],
    quotations: [
      { id: 'QT-2026-001', clientId: 'CLI-001', projectName: 'ABC Residential Villa – Chennai', location: 'Chennai, Tamil Nadu', quoteDate: '2026-06-20', validUntil: '2026-07-20', status: 'Approved', projectId: P1 },
      { id: 'QT-2026-002', clientId: 'CLI-002', projectName: 'Green Valley Commercial Building', location: 'Madurai, Tamil Nadu', quoteDate: '2026-06-01', validUntil: '2026-07-01', status: 'Approved', projectId: P2 },
      { id: 'QT-2026-003', clientId: 'CLI-003', projectName: 'SRK Warehouse Development', location: 'Coimbatore, Tamil Nadu', quoteDate: '2026-01-10', validUntil: '2026-02-10', status: 'Approved', projectId: P3 },
      { id: 'QT-2026-004', clientId: 'CLI-004', projectName: 'Meenakshi Hospital Annex Block', location: 'Tiruchirappalli, Tamil Nadu', quoteDate: '2026-09-15', validUntil: '2026-10-31', status: 'Under Review' },
      { id: 'QT-2026-005', clientId: 'CLI-005', projectName: 'Coastal Logistics Warehouse – Thoothukudi', location: 'Thoothukudi, Tamil Nadu', quoteDate: '2026-09-10', validUntil: '2026-10-25', status: 'Approved', notes: 'Approved by client on 28-Sep-2026. Ready to convert.' },
      { id: 'QT-2026-006', clientId: 'CLI-006', projectName: 'Sai Ram School – Academic Block', location: 'Salem, Tamil Nadu', quoteDate: '2026-04-25', validUntil: '2026-05-25', status: 'Rejected', notes: 'Client went with lower bid.' },
    ],
    quotationItems: [
      ...[['Foundation', 800000, 550000], ['Structure', 1500000, 1000000], ['Electrical & Plumbing', 700000, 450000], ['Finishing', 2000000, 1400000]]
        .map(([d, a, c], i) => ({ id: `QI-${String(i + 1).padStart(3, '0')}`, quotationId: 'QT-2026-001', description: d as string, amount: a as number, estimatedCost: c as number })),
      ...[['Site Preparation & Piling', 1200000, 820000], ['Foundation & Basement', 1800000, 1200000], ['Superstructure (G+3)', 3000000, 2000000], ['MEP Services', 1000000, 650000], ['Facade & Finishing', 1250000, 830000]]
        .map(([d, a, c], i) => ({ id: `QI-${String(i + 5).padStart(3, '0')}`, quotationId: 'QT-2026-002', description: d as string, amount: a as number, estimatedCost: c as number })),
      ...[['Earthwork & Foundation', 700000, 500000], ['Steel Structure (PEB)', 1500000, 1050000], ['Flooring & Roofing', 900000, 620000], ['Electrical & Drainage', 400000, 260000]]
        .map(([d, a, c], i) => ({ id: `QI-${String(i + 10).padStart(3, '0')}`, quotationId: 'QT-2026-003', description: d as string, amount: a as number, estimatedCost: c as number })),
      ...[['Foundation', 1000000, 700000], ['RCC Structure (G+2)', 2200000, 1550000], ['MEP & Medical Gas', 1200000, 850000], ['Finishing & Interiors', 1600000, 1100000]]
        .map(([d, a, c], i) => ({ id: `QI-${String(i + 14).padStart(3, '0')}`, quotationId: 'QT-2026-004', description: d as string, amount: a as number, estimatedCost: c as number })),
      ...[['Site Development', 600000, 420000], ['Foundation', 900000, 630000], ['PEB Structure', 1800000, 1260000], ['Flooring & Services', 700000, 490000]]
        .map(([d, a, c], i) => ({ id: `QI-${String(i + 18).padStart(3, '0')}`, quotationId: 'QT-2026-005', description: d as string, amount: a as number, estimatedCost: c as number })),
      ...[['Foundation & Structure', 1800000, 1350000], ['Finishing', 1000000, 750000]]
        .map(([d, a, c], i) => ({ id: `QI-${String(i + 22).padStart(3, '0')}`, quotationId: 'QT-2026-006', description: d as string, amount: a as number, estimatedCost: c as number })),
    ],
    contracts: [
      { id: 'CON-2026-001', projectId: P1, clientId: 'CLI-001', value: 5000000, startDate: '2026-08-01', endDate: '2027-01-31', signedDate: '2026-07-25', documentId: 'DOC-001', status: 'Active' },
      { id: 'CON-2026-002', projectId: P2, clientId: 'CLI-002', value: 8250000, startDate: '2026-07-15', endDate: '2027-04-30', signedDate: '2026-07-10', documentId: 'DOC-002', status: 'Active' },
      { id: 'CON-2026-003', projectId: P3, clientId: 'CLI-003', value: 3500000, startDate: '2026-02-01', endDate: '2026-09-30', signedDate: '2026-01-28', documentId: 'DOC-003', status: 'Completed' },
    ],
    phases,
    expenses,
    suppliers: [
      { id: 'SUP-001', name: 'Sri Lakshmi Cement Suppliers', category: 'Material Supplier', contactPerson: 'Venkatesh', phone: '+91 94440 12345', email: 'sales@srilakshmicement.in', city: 'Chennai' },
      { id: 'SUP-002', name: 'Kumar Steel Traders', category: 'Steel Supplier', contactPerson: 'Kumaravel', phone: '+91 98400 56781', email: 'orders@kumarsteel.in', city: 'Chennai' },
      { id: 'SUP-003', name: 'Star Excavation Services', category: 'Outsource Contractor', contactPerson: 'Stalin', phone: '+91 97100 34512', email: 'ops@starexcavation.in', city: 'Madurai' },
      { id: 'SUP-004', name: 'Royal Electrical Works', category: 'Electrical Contractor', contactPerson: 'Rahim', phone: '+91 99620 88213', email: 'royalelectrical@gmail.com', city: 'Coimbatore' },
      { id: 'SUP-005', name: 'Annai Building Materials', category: 'Material Supplier', contactPerson: 'Mariappan', phone: '+91 95000 22871', email: 'annaibm@gmail.com', city: 'Madurai' },
      { id: 'SUP-006', name: 'Vel Murugan Construction Services', category: 'Outsource Contractor', contactPerson: 'Velmurugan', phone: '+91 93450 66120', email: 'vmconstructions@gmail.com', city: 'Coimbatore' },
      { id: 'SUP-007', name: 'Chennai Equipment Rentals', category: 'Equipment Rental', contactPerson: 'Prabhu', phone: '+91 98844 30902', email: 'hire@chennaiequip.in', city: 'Chennai' },
    ],
    supplierInvoices,
    supplierPayments,
    clientInvoices,
    clientPayments,
    changeOrders: [
      { id: 'CO-001', number: 'CO-2026-001', projectId: P1, description: 'Additional compound wall construction (180 running ft)', date: '2026-09-14', revenue: 500000, estimatedCost: 300000, status: 'Approved', approvedDate: '2026-09-18', phaseId: 'PH-005' },
      { id: 'CO-002', number: 'CO-2026-002', projectId: P2, description: 'Additional basement waterproofing & sump', date: '2026-09-26', revenue: 250000, estimatedCost: 160000, status: 'Pending Approval' },
      { id: 'CO-003', number: 'CO-2026-003', projectId: P3, description: 'Additional loading dock ramp', date: '2026-06-05', revenue: 300000, estimatedCost: 200000, status: 'Approved', approvedDate: '2026-06-10', phaseId: 'PH-015' },
    ],
    documents: [
      { id: 'DOC-001', name: 'ABC_Villa_Signed_Contract.pdf', type: 'Signed Contract', entityType: 'Contract', entityId: 'CON-2026-001', projectId: P1, uploadedAt: '2026-07-25', uploadedBy: 'Eng. Arun Kumar', sizeKb: 2480 },
      { id: 'DOC-002', name: 'GreenValley_Signed_Contract.pdf', type: 'Signed Contract', entityType: 'Contract', entityId: 'CON-2026-002', projectId: P2, uploadedAt: '2026-07-10', uploadedBy: 'Eng. Mohammed Irfan', sizeKb: 3120 },
      { id: 'DOC-003', name: 'SRK_Warehouse_Signed_Contract.pdf', type: 'Signed Contract', entityType: 'Contract', entityId: 'CON-2026-003', projectId: P3, uploadedAt: '2026-01-28', uploadedBy: 'Eng. Prakash', sizeKb: 1960 },
      { id: 'DOC-004', name: 'QT-2026-001_ABC_Villa_Quotation.pdf', type: 'Quotation', entityType: 'Quotation', entityId: 'QT-2026-001', projectId: P1, uploadedAt: '2026-06-20', uploadedBy: 'Admin', sizeKb: 640 },
      { id: 'DOC-005', name: 'ABC_Villa_BOQ_Rev2.xlsx', type: 'BOQ', entityType: 'Project', entityId: P1, projectId: P1, uploadedAt: '2026-07-28', uploadedBy: 'Eng. Arun Kumar', sizeKb: 412 },
      { id: 'DOC-006', name: 'GreenValley_BOQ.xlsx', type: 'BOQ', entityType: 'Project', entityId: P2, projectId: P2, uploadedAt: '2026-07-12', uploadedBy: 'Eng. Mohammed Irfan', sizeKb: 588 },
      { id: 'DOC-007', name: 'SLC_26_0412_Cement_Invoice.pdf', type: 'Supplier Invoice', entityType: 'Supplier', entityId: 'SUP-001', projectId: P1, uploadedAt: '2026-08-05', uploadedBy: 'Accounts', sizeKb: 220 },
      { id: 'DOC-008', name: 'KST-2350_Steel_Invoice.pdf', type: 'Supplier Invoice', entityType: 'Supplier', entityId: 'SUP-002', projectId: P1, uploadedAt: '2026-09-06', uploadedBy: 'Accounts', sizeKb: 198 },
      { id: 'DOC-009', name: 'INV-2026-007_Foundation.pdf', type: 'Client Invoice', entityType: 'Invoice', entityId: 'CINV-007', projectId: P1, uploadedAt: '2026-09-02', uploadedBy: 'Accounts', sizeKb: 156 },
      { id: 'DOC-010', name: 'PAY-011_Receipt.pdf', type: 'Payment Receipt', entityType: 'Invoice', entityId: 'CINV-007', projectId: P1, uploadedAt: '2026-09-10', uploadedBy: 'Accounts', sizeKb: 88 },
      { id: 'DOC-011', name: 'Foundation_Pour_Site_Photo.jpg', type: 'Site Photo', entityType: 'Phase', entityId: 'PH-001', projectId: P1, uploadedAt: '2026-08-22', uploadedBy: 'Site Engineer', sizeKb: 3540 },
      { id: 'DOC-012', name: 'GV_Piling_Completion_Photo.jpg', type: 'Site Photo', entityType: 'Phase', entityId: 'PH-006', projectId: P2, uploadedAt: '2026-08-14', uploadedBy: 'Site Engineer', sizeKb: 4120 },
      { id: 'DOC-013', name: 'SRK_Monthly_Progress_Aug.pdf', type: 'Project Report', entityType: 'Project', entityId: P3, projectId: P3, uploadedAt: '2026-09-01', uploadedBy: 'Eng. Prakash', sizeKb: 1290 },
      { id: 'DOC-014', name: 'QT-2026-005_Coastal_Quotation.pdf', type: 'Quotation', entityType: 'Quotation', entityId: 'QT-2026-005', uploadedAt: '2026-09-10', uploadedBy: 'Admin', sizeKb: 702 },
    ],
    closures: [],
  }
}
