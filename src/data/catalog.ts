import type { CostCategory } from './types'

// Master lists (future: lookup tables).

export const EXPENSE_SUBTYPES: Record<CostCategory, string[]> = {
  material: ['Cement', 'Steel', 'Sand', 'Bricks', 'Electrical Materials', 'Plumbing Materials', 'Other Materials'],
  labour: ['Mason', 'Helper', 'Electrician', 'Plumber', 'Supervisor', 'Other Labour'],
  outsource: ['Excavation', 'Fabrication', 'Equipment Rental', 'Specialist Contractor', 'Transport', 'Other Outsource'],
  other: ['Survey & Testing', 'Site Utilities', 'Site Security', 'Permits & Fees', 'Other Direct'],
}

export const MATERIAL_UNITS = ['Bags', 'Kg', 'MT', 'Nos', 'Cu.m', 'Cu.ft', 'Lot', 'Other']
export const OUTSOURCE_UNITS = ['Sq.ft', 'Sq.m', 'Running ft', 'Cu.m', 'Day', 'Hour', 'Other']

export const DEFAULT_MATERIAL_UNIT: Record<string, string> = {
  Cement: 'Bags', Steel: 'Kg', Sand: 'Cu.m', Bricks: 'Nos', 'Electrical Materials': 'Lot', 'Plumbing Materials': 'Lot', 'Other Materials': 'Lot',
}

export const DEFAULT_DAILY_RATE: Record<string, number> = {
  Mason: 1200, Helper: 800, Electrician: 1100, Plumber: 1100, Supervisor: 2000, 'Other Labour': 1000,
}

export const PROJECT_MANAGERS = ['Eng. Arun Kumar', 'Eng. Mohammed Irfan', 'Eng. Prakash', 'Eng. Divya Shankar']
