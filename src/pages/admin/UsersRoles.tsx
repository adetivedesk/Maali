import { useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Button, Callout, Card, EmptyRow, Field, Input, Modal, PageHeader, Pill, Select, Table, Tabs, Td, Th } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { ADMIN_ROLE_ID, LEVELS, LEVEL_HELP, MENUS, normalizePermissions, type Level, type MenuKey, type Permissions } from '../../lib/permissions'
import { api, useStore } from '../../store/store'

interface UserRow {
  id: string; username: string; name: string; email: string; roleId: string; active: boolean
  mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string; locked: boolean
}
interface RoleRow { id: string; name: string; description: string; permissions: Permissions; system: boolean }
interface Data { users: UserRow[]; roles: RoleRow[] }

const post = <T,>(body: unknown) => api<T>('admin', { method: 'POST', body: JSON.stringify(body) })

export function UsersRoles() {
  const { notify, can, user: me } = useStore()
  const [tab, setTab] = useState<'users' | 'roles'>('users')
  const [data, setData] = useState<Data | null>(null)
  const [editUser, setEditUser] = useState<UserRow | 'new' | null>(null)
  const [editRole, setEditRole] = useState<RoleRow | 'new' | null>(null)
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null)
  const canWrite = can('users', 'write')
  const canDelete = can('users', 'delete')

  const load = useCallback(() => api<Data>('admin?view=users').then(setData).catch((e) => notify(e.message, 'error')), [notify])
  useEffect(() => { void load() }, [load])

  async function resetPassword(u: UserRow) {
    if (!window.confirm(`Reset the password of ${u.username}? They will be signed out and must set a new password at next sign-in.`)) return
    try {
      const r = await post<Data & { password: string }>({ action: 'resetPassword', id: u.id })
      setData(r); setSecret({ username: u.username, password: r.password })
    } catch (e) { notify((e as Error).message, 'error') }
  }
  async function deleteRole(r: RoleRow) {
    if (!window.confirm(`Delete the role ${r.name}?`)) return
    try { setData(await post<Data>({ action: 'deleteRole', id: r.id })); notify(`Role ${r.name} deleted`) } catch (e) { notify((e as Error).message, 'error') }
  }

  const roleName = (id: string) => data?.roles.find((r) => r.id === id)?.name ?? id

  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Who can sign in, and what each role may see, change and delete."
        actions={canWrite && (tab === 'users'
          ? <Button variant="primary" icon={<UserPlus size={15} />} onClick={() => setEditUser('new')}>New user</Button>
          : <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditRole('new')}>New role</Button>)} />
      {secret && (
        <div className="mb-4">
          <Callout tone="warning">
            <div className="flex flex-wrap items-center gap-2">
              <span>One-time password for <b>{secret.username}</b>:</span>
              <code className="rounded bg-white px-2 py-0.5 font-mono text-sm ring-1 ring-amber-300">{secret.password}</code>
              <Button size="sm" icon={<Copy size={12} />} onClick={() => { void navigator.clipboard?.writeText(secret.password); notify('Copied') }}>Copy</Button>
              <button type="button" className="ml-auto text-xs underline" onClick={() => setSecret(null)}>Done</button>
            </div>
            <div className="mt-1 text-xs">Give it to the user privately. It is shown only once; they must choose their own password at first sign-in.</div>
          </Callout>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'users', label: 'Users', count: data?.users.length }, { id: 'roles', label: 'Roles', count: data?.roles.length }]} />
      {tab === 'users' ? (
        <Card bodyClassName="">
          <Table>
            <thead><tr><Th>Name</Th><Th>Username</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th right>Actions</Th></tr></thead>
            <tbody>
              {!data && <EmptyRow cols={6}>Loading…</EmptyRow>}
              {data?.users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <Td><div className="font-medium text-navy-900">{u.name}{u.id === me.id && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}</div>{u.email && <div className="text-xs text-slate-500">{u.email}</div>}</Td>
                  <Td className="font-mono text-xs">{u.username}</Td>
                  <Td>{roleName(u.roleId)}</Td>
                  <Td className="space-x-1">
                    {u.active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Disabled</Pill>}
                    {u.locked && <Pill tone="red">Locked</Pill>}
                    {u.active && u.mustChangePassword && <Pill tone="amber">Password pending</Pill>}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{u.lastLoginAt ? `${formatDate(u.lastLoginAt.slice(0, 10))} ${new Date(u.lastLoginAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : 'Never'}</Td>
                  <Td right>
                    {canWrite && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" icon={<Pencil size={12} />} onClick={() => setEditUser(u)}>Edit</Button>
                        <Button size="sm" icon={<KeyRound size={12} />} onClick={() => resetPassword(u)}>Reset password</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.roles.map((r) => {
            const n = data.users.filter((u) => u.roleId === r.id).length
            const menus = MENUS.filter((m) => r.permissions[m.key]?.read)
            return (
              <Card key={r.id} title={<span className="flex items-center gap-2">{r.system && <ShieldCheck size={15} className="text-blue-600" />}{r.name}</span>}
                subtitle={`${n} user${n === 1 ? '' : 's'}`}
                actions={canWrite && !r.system && (
                  <>
                    <Button size="sm" icon={<Pencil size={12} />} onClick={() => setEditRole(r)}>Edit</Button>
                    {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => deleteRole(r)} title="Delete role" />}
                  </>
                )}>
                <p className="text-sm text-slate-600">{r.description || '—'}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {menus.map((m) => {
                    const a = r.permissions[m.key]
                    return <Pill key={m.key} tone={a.delete ? 'red' : a.write ? 'blue' : 'slate'}>{m.label} · {a.delete ? 'RWD' : a.write ? 'RW' : 'R'}</Pill>
                  })}
                </div>
                {r.system && <p className="mt-3 text-xs text-slate-400">Built-in role with full access; it cannot be changed.</p>}
              </Card>
            )
          })}
        </div>
      )}
      {data && editUser && (
        <UserDialog user={editUser === 'new' ? null : editUser} roles={data.roles} onClose={() => setEditUser(null)}
          onSaved={(d, password, username) => { setData(d); setEditUser(null); if (password) setSecret({ username: username!, password }) }} />
      )}
      {editRole && <RoleDialog role={editRole === 'new' ? null : editRole} onClose={() => setEditRole(null)} onSaved={(d) => { setData(d); setEditRole(null) }} />}
    </>
  )
}

function UserDialog({ user, roles, onClose, onSaved }: { user: UserRow | null; roles: RoleRow[]; onClose: () => void; onSaved: (d: Data, password?: string, username?: string) => void }) {
  const { notify, user: me } = useStore()
  const [f, setF] = useState({ username: user?.username ?? '', name: user?.name ?? '', email: user?.email ?? '', roleId: user?.roleId ?? roles.find((r) => r.id !== ADMIN_ROLE_ID)?.id ?? ADMIN_ROLE_ID, active: user?.active ?? true })
  const [busy, setBusy] = useState(false)
  const self = user?.id === me.id
  async function save() {
    setBusy(true)
    try {
      if (user) {
        const d = await post<Data>({ action: 'updateUser', id: user.id, name: f.name, email: f.email, roleId: f.roleId, active: f.active })
        notify(`${user.username} updated`); onSaved(d)
      } else {
        const d = await post<Data & { password: string }>({ action: 'createUser', username: f.username, name: f.name, email: f.email, roleId: f.roleId })
        notify(`User ${f.username} created`); onSaved(d, d.password, f.username.toLowerCase())
      }
    } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={user ? `Edit ${user.username}` : 'New user'} subtitle={user ? undefined : 'A one-time password is generated; the user sets their own at first sign-in.'} width="max-w-lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !f.name.trim() || (!user && !f.username.trim())} onClick={save}>{busy ? 'Saving…' : user ? 'Save' : 'Create user'}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Username" hint={!user && 'Lowercase letters, digits, dot, dash, underscore'}><Input value={f.username} disabled={!!user} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="e.g. arun.kumar" /></Field>
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Shown on records they create" /></Field>
        <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.roleId} disabled={self} onChange={(e) => setF({ ...f, roleId: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      </div>
      <p className="mt-2 text-xs text-slate-500">{roles.find((r) => r.id === f.roleId)?.description}</p>
      {user && (
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.active} disabled={self} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
          Account active (disabled users cannot sign in and are signed out immediately)
        </label>
      )}
    </Modal>
  )
}

function RoleDialog({ role, onClose, onSaved }: { role: RoleRow | null; onClose: () => void; onSaved: (d: Data) => void }) {
  const { notify } = useStore()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [perms, setPerms] = useState<Permissions>(role?.permissions ?? normalizePermissions({ dashboard: { read: true } }))
  const [busy, setBusy] = useState(false)

  const toggle = (menu: MenuKey, level: Level, on: boolean) => {
    const a = { ...perms[menu], [level]: on }
    if (level === 'read' && !on) { a.write = false; a.delete = false } // no read → nothing
    setPerms(normalizePermissions({ ...perms, [menu]: a }))
  }
  const column = (level: Level, on: boolean) => {
    const next = { ...perms }
    for (const m of MENUS) next[m.key] = { ...next[m.key], [level]: on, ...(level === 'read' && !on ? { write: false, delete: false } : {}) }
    setPerms(normalizePermissions(next))
  }
  async function save() {
    setBusy(true)
    try { onSaved(await post<Data>({ action: 'saveRole', id: role?.id, name, description, permissions: perms })); notify(`Role ${name} saved`) } catch (e) { notify((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const groups = [...new Set(MENUS.map((m) => m.group))]
  return (
    <Modal open onClose={onClose} title={role ? `Edit role · ${role.name}` : 'New role'} width="max-w-2xl"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save role'}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Role name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Purchase Officer" /></Field>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left font-semibold">Menu</th>
              {LEVELS.map((l) => (
                <th key={l} className="px-3 py-2 text-center font-semibold" title={LEVEL_HELP[l]}>
                  {l}
                  <div className="mt-0.5 flex justify-center gap-1 normal-case tracking-normal">
                    <button type="button" className="text-[10px] text-blue-600 hover:underline" onClick={() => column(l, true)}>all</button>
                    <button type="button" className="text-[10px] text-slate-500 hover:underline" onClick={() => column(l, false)}>none</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentRows key={g} group={g}>
                {MENUS.filter((m) => m.group === g).map((m) => (
                  <tr key={m.key} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-700">{m.label}</td>
                    {LEVELS.map((l) => (
                      <td key={l} className="px-3 py-1.5 text-center">
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={perms[m.key][l]} onChange={(e) => toggle(m.key, l, e.target.checked)} aria-label={`${m.label} ${l}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </FragmentRows>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Read: {LEVEL_HELP.read}. Write: {LEVEL_HELP.write}. Delete: {LEVEL_HELP.delete}. Write or delete includes read.</p>
    </Modal>
  )
}

function FragmentRows({ group, children }: { group: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60"><td colSpan={4} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group}</td></tr>
      {children}
    </>
  )
}
