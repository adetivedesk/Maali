// Role-based access. Each role grants read / write / delete per menu.
// The server enforces write and delete on every command; read controls which
// menus and screens a user sees.

export const MENUS = [
  { key: 'dashboard', label: 'Dashboard', group: 'Business' },
  { key: 'clients', label: 'Clients', group: 'Business' },
  { key: 'projects', label: 'Projects', group: 'Business' },
  { key: 'quotations', label: 'Quotations', group: 'Business' },
  { key: 'contracts', label: 'Contracts', group: 'Business' },
  { key: 'phases', label: 'Phases', group: 'Business' },
  { key: 'expenses', label: 'Expenses', group: 'Business' },
  { key: 'suppliers', label: 'Suppliers', group: 'Business' },
  { key: 'billing', label: 'Client Billing', group: 'Business' },
  { key: 'payments', label: 'Payments', group: 'Business' },
  { key: 'profitability', label: 'Profitability', group: 'Business' },
  { key: 'documents', label: 'Documents', group: 'Business' },
  { key: 'reports', label: 'Reports', group: 'Business' },
  { key: 'users', label: 'Users & Roles', group: 'Administration' },
  { key: 'activity', label: 'Activity Log', group: 'Administration' },
  { key: 'settings', label: 'Settings & Backup', group: 'Administration' },
] as const

export type MenuKey = (typeof MENUS)[number]['key']
export type Level = 'read' | 'write' | 'delete'
export interface Access { read: boolean; write: boolean; delete: boolean }
export type Permissions = Record<MenuKey, Access>

export const LEVELS: Level[] = ['read', 'write', 'delete']
export const MENU_KEYS = MENUS.map((m) => m.key) as MenuKey[]
export const isMenuKey = (k: string): k is MenuKey => (MENU_KEYS as string[]).includes(k)

/** What each level allows, shown in the role editor. */
export const LEVEL_HELP: Record<Level, string> = {
  read: 'See the menu and its records',
  write: 'Create and edit records',
  delete: 'Delete records, cancel invoices and payments',
}

export const ADMIN_ROLE_ID = 'ROLE-ADMIN'

const NONE: Access = { read: false, write: false, delete: false }

/** Fill gaps and make write/delete imply read. */
export function normalizePermissions(p: Partial<Record<string, Partial<Access>>> | undefined): Permissions {
  const out = {} as Permissions
  for (const k of MENU_KEYS) {
    const a = { ...NONE, ...(p?.[k] ?? {}) }
    out[k] = { read: !!(a.read || a.write || a.delete), write: !!a.write, delete: !!a.delete }
  }
  return out
}

export const fullAccess = (): Permissions => normalizePermissions(Object.fromEntries(MENU_KEYS.map((k) => [k, { read: true, write: true, delete: true }])))

export const can = (p: Permissions | undefined, menu: MenuKey, level: Level = 'read') => !!p?.[menu]?.[level]

function grant(spec: Partial<Record<MenuKey, string>>): Permissions {
  return normalizePermissions(Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, { read: v!.includes('r'), write: v!.includes('w'), delete: v!.includes('d') }])))
}

const BUSINESS_READ: Partial<Record<MenuKey, string>> = Object.fromEntries(
  MENUS.filter((m) => m.group === 'Business').map((m) => [m.key, 'r']),
)

export interface RoleDef { id: string; name: string; description: string; permissions: Permissions; system?: boolean }

/** Starting roles; admins can edit everything except the Administrator role. */
export const DEFAULT_ROLES: RoleDef[] = [
  { id: ADMIN_ROLE_ID, name: 'Administrator', description: 'Full access, including users, roles, settings and backup.', permissions: fullAccess(), system: true },
  {
    id: 'ROLE-PM', name: 'Project Manager', description: 'Runs projects end to end: quotations, contracts, phases and site costs.',
    permissions: grant({ ...BUSINESS_READ, clients: 'rw', projects: 'rw', quotations: 'rwd', contracts: 'rw', phases: 'rwd', expenses: 'rwd', documents: 'rwd', activity: 'r' }),
  },
  {
    id: 'ROLE-ACCOUNTS', name: 'Accounts', description: 'Billing, receipts, supplier payments and cost entry.',
    permissions: grant({ ...BUSINESS_READ, clients: 'rw', suppliers: 'rwd', expenses: 'rwd', billing: 'rwd', payments: 'rwd', documents: 'rwd', activity: 'r' }),
  },
  {
    id: 'ROLE-SITE', name: 'Site Engineer', description: 'Records site costs and phase progress for their projects.',
    permissions: grant({ dashboard: 'r', projects: 'r', phases: 'rw', expenses: 'rw', suppliers: 'r', documents: 'rw' }),
  },
  { id: 'ROLE-VIEWER', name: 'Viewer', description: 'Read-only access to every business screen.', permissions: grant(BUSINESS_READ) },
]
