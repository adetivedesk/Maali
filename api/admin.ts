import { ADMIN_ROLE_ID, isMenuKey, normalizePermissions } from '../src/lib/permissions.js'
import { checkPasswordStrength, hashPassword, requireAccess, requireUser, temporaryPassword, type SessionUser } from './_lib/auth.js'
import {
  COLLECTIONS, DEFAULT_SETTINGS, fail, HttpError, json, loadSettings, loadSnapshot, logAction, requireAppRequest, saveSettings, sql, TABLES,
  type CompanySettings,
} from './_lib/db.js'
import { clearBusinessData, ensureRoles, seedDemoData } from './_lib/setup.js'

// Administration: users, roles, company settings, activity log, backup export,
// demo reset and clearing business data for go-live.

interface UserRow { id: string; username: string; name: string; email: string; role_id: string; active: boolean; must_change_password: boolean; last_login_at: string | null; created_at: string; locked_until: string | null }

async function listUsersAndRoles() {
  await ensureRoles()
  const q = sql()
  const [users, roles] = await q.transaction([
    q.query('SELECT id, username, name, email, role_id, active, must_change_password, last_login_at, created_at, locked_until FROM users ORDER BY created_at'),
    q.query('SELECT id, name, description, permissions, system FROM roles ORDER BY system DESC, name'),
  ]) as [UserRow[], { id: string; name: string; description: string; permissions: unknown; system: boolean }[]]
  return {
    users: users.map((u) => ({
      id: u.id, username: u.username, name: u.name, email: u.email, roleId: u.role_id, active: u.active,
      mustChangePassword: u.must_change_password, lastLoginAt: u.last_login_at, createdAt: u.created_at,
      locked: !!u.locked_until && new Date(u.locked_until) > new Date(),
    })),
    roles: roles.map((r) => ({ ...r, permissions: normalizePermissions(r.permissions as never) })),
  }
}

const str = (v: unknown, label: string, max = 120) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) throw new HttpError(400, `${label} is required`)
  if (s.length > max) throw new HttpError(400, `${label} is too long`)
  return s
}

async function activeAdmins(excludeId?: string) {
  const [{ n }] = await sql().query(`SELECT count(*)::int AS n FROM users WHERE role_id = $1 AND active AND id <> $2`, [ADMIN_ROLE_ID, excludeId ?? '']) as { n: number }[]
  return n
}

async function nextUserId() {
  const [{ n }] = await sql().query(`SELECT coalesce(max(substring(id from 5)::int), 0) + 1 AS n FROM users WHERE id ~ '^USR-[0-9]+$'`) as { n: number }[]
  return `USR-${String(n).padStart(3, '0')}`
}

const log = (u: SessionUser, action: string, summary: string, changes: unknown = []) =>
  logAction({ userId: u.id, userName: u.name, action, summary, changes })

export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const params = new URL(request.url).searchParams
    switch (params.get('view')) {
      case 'users':
        requireAccess(user, 'users', 'read')
        return json(await listUsersAndRoles())
      case 'audit': {
        requireAccess(user, 'activity', 'read')
        const before = Number(params.get('before')) || null
        const limit = Math.min(Number(params.get('limit')) || 50, 200)
        const search = (params.get('q') ?? '').trim()
        const rows = await sql().query(
          `SELECT id, at, version, user_name, action, summary, changes FROM audit_log
            WHERE ($1::bigint IS NULL OR id < $1) AND ($2 = '' OR user_name ILIKE '%' || $2 || '%' OR action ILIKE '%' || $2 || '%' OR summary ILIKE '%' || $2 || '%' OR changes::text ILIKE '%' || $2 || '%')
            ORDER BY id DESC LIMIT $3`,
          [before, search, limit],
        )
        return json({ entries: rows })
      }
      case 'export': {
        requireAccess(user, 'settings', 'read')
        const [snap, settings, roles] = await Promise.all([loadSnapshot(), loadSettings(), listUsersAndRoles()])
        await log(user, 'export', 'Downloaded a full data backup')
        const stamp = new Date().toISOString().slice(0, 10)
        return json(
          { exportedAt: new Date().toISOString(), exportedBy: user.name, version: snap.version, settings, ...roles, tables: Object.fromEntries(COLLECTIONS.map((c) => [TABLES[c], snap.db[c]])) },
          200,
          { 'content-disposition': `attachment; filename="maali-backup-${stamp}.json"` },
        )
      }
      default:
        throw new HttpError(400, 'Unknown view')
    }
  } catch (e) {
    return fail(e)
  }
}

export async function POST(request: Request) {
  try {
    requireAppRequest(request)
    const user = await requireUser(request)
    const b = await request.json().catch(() => ({})) as Record<string, unknown>
    const q = sql()
    switch (b.action) {
      // ---- users ----
      case 'createUser': {
        requireAccess(user, 'users', 'write')
        const username = str(b.username, 'Username', 40).toLowerCase()
        if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new HttpError(400, 'Username: 3–40 letters, digits, dot, dash or underscore')
        const name = str(b.name, 'Full name')
        const roleId = str(b.roleId, 'Role')
        const email = typeof b.email === 'string' ? b.email.trim().slice(0, 120) : ''
        const [exists] = await q.query('SELECT 1 FROM users WHERE lower(username) = $1', [username])
        if (exists) throw new HttpError(409, `Username ${username} is taken`)
        const [role] = await q.query('SELECT name FROM roles WHERE id = $1', [roleId]) as { name: string }[]
        if (!role) throw new HttpError(400, 'Unknown role')
        const password = typeof b.password === 'string' && b.password ? checkPasswordStrength(b.password) : temporaryPassword()
        const id = await nextUserId()
        await q.query(
          `INSERT INTO users (id, username, name, email, role_id, password_hash, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [id, username, name, email, roleId, await hashPassword(password)],
        )
        await log(user, 'createUser', `Created user ${username} (${name}) as ${role.name}`, [{ collection: 'users', id, op: 'insert', after: { username, name, email, roleId } }])
        return json({ id, password, ...(await listUsersAndRoles()) })
      }
      case 'updateUser': {
        requireAccess(user, 'users', 'write')
        const id = str(b.id, 'User')
        const [before] = await q.query('SELECT username, name, email, role_id, active FROM users WHERE id = $1', [id]) as { username: string; name: string; email: string; role_id: string; active: boolean }[]
        if (!before) throw new HttpError(404, 'User not found')
        const name = str(b.name, 'Full name')
        const email = typeof b.email === 'string' ? b.email.trim().slice(0, 120) : ''
        const roleId = str(b.roleId, 'Role')
        const active = b.active !== false
        const [role] = await q.query('SELECT name FROM roles WHERE id = $1', [roleId]) as { name: string }[]
        if (!role) throw new HttpError(400, 'Unknown role')
        if (id === user.id && (!active || roleId !== before.role_id)) throw new HttpError(400, 'You cannot disable yourself or change your own role')
        if (before.role_id === ADMIN_ROLE_ID && (roleId !== ADMIN_ROLE_ID || !active) && (await activeAdmins(id)) === 0) throw new HttpError(400, 'At least one active administrator is required')
        await q.transaction([
          q.query('UPDATE users SET name = $2, email = $3, role_id = $4, active = $5 WHERE id = $1', [id, name, email, roleId, active]),
          // Role or status change takes effect immediately: sign the user out.
          ...(roleId !== before.role_id || !active ? [q.query('DELETE FROM sessions WHERE user_id = $1', [id])] : []),
        ])
        await log(user, 'updateUser', `Updated user ${before.username}${!active && before.active ? ' (disabled)' : ''}${active && !before.active ? ' (enabled)' : ''}${roleId !== before.role_id ? ` → ${role.name}` : ''}`,
          [{ collection: 'users', id, op: 'update', before: { name: before.name, email: before.email, roleId: before.role_id, active: before.active }, after: { name, email, roleId, active } }])
        return json(await listUsersAndRoles())
      }
      case 'resetPassword': {
        requireAccess(user, 'users', 'write')
        const id = str(b.id, 'User')
        const [u] = await q.query('SELECT username FROM users WHERE id = $1', [id]) as { username: string }[]
        if (!u) throw new HttpError(404, 'User not found')
        const password = temporaryPassword()
        await q.transaction([
          q.query('UPDATE users SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL WHERE id = $1', [id, await hashPassword(password)]),
          q.query('DELETE FROM sessions WHERE user_id = $1', [id]),
        ])
        await log(user, 'resetPassword', `Reset the password of ${u.username}`)
        return json({ password, ...(await listUsersAndRoles()) })
      }

      // ---- roles ----
      case 'saveRole': {
        requireAccess(user, 'users', 'write')
        const name = str(b.name, 'Role name', 60)
        const description = typeof b.description === 'string' ? b.description.trim().slice(0, 200) : ''
        const raw = (b.permissions ?? {}) as Record<string, unknown>
        if (Object.keys(raw).some((k) => !isMenuKey(k))) throw new HttpError(400, 'Unknown menu in permissions')
        const permissions = normalizePermissions(raw as never)
        let id = typeof b.id === 'string' && b.id ? b.id : null
        if (id === ADMIN_ROLE_ID) throw new HttpError(400, 'The Administrator role cannot be changed')
        const [dup] = await q.query('SELECT id FROM roles WHERE lower(name) = lower($1) AND id <> $2', [name, id ?? '']) as { id: string }[]
        if (dup) throw new HttpError(409, `A role named ${name} already exists`)
        if (id) {
          const [before] = await q.query('SELECT name, permissions FROM roles WHERE id = $1', [id]) as { name: string; permissions: unknown }[]
          if (!before) throw new HttpError(404, 'Role not found')
          await q.query('UPDATE roles SET name = $2, description = $3, permissions = $4::jsonb, updated_at = now() WHERE id = $1', [id, name, description, JSON.stringify(permissions)])
          await log(user, 'saveRole', `Updated role ${name}`, [{ collection: 'roles', id, op: 'update', before, after: { name, permissions } }])
        } else {
          id = `ROLE-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'CUSTOM'}`
          const [taken] = await q.query('SELECT 1 FROM roles WHERE id = $1', [id])
          if (taken) id = `${id}-${Date.now().toString(36).toUpperCase()}`
          await q.query('INSERT INTO roles (id, name, description, permissions) VALUES ($1, $2, $3, $4::jsonb)', [id, name, description, JSON.stringify(permissions)])
          await log(user, 'saveRole', `Created role ${name}`, [{ collection: 'roles', id, op: 'insert', after: { name, permissions } }])
        }
        return json(await listUsersAndRoles())
      }
      case 'deleteRole': {
        requireAccess(user, 'users', 'delete')
        const id = str(b.id, 'Role')
        const [role] = await q.query('SELECT name, system FROM roles WHERE id = $1', [id]) as { name: string; system: boolean }[]
        if (!role) throw new HttpError(404, 'Role not found')
        if (role.system) throw new HttpError(400, 'The Administrator role cannot be deleted')
        const [{ n }] = await q.query('SELECT count(*)::int AS n FROM users WHERE role_id = $1', [id]) as { n: number }[]
        if (n > 0) throw new HttpError(400, `${role.name} is assigned to ${n} user(s); move them to another role first`)
        await q.query('DELETE FROM roles WHERE id = $1', [id])
        await log(user, 'deleteRole', `Deleted role ${role.name}`, [{ collection: 'roles', id, op: 'delete' }])
        return json(await listUsersAndRoles())
      }

      // ---- settings & data ----
      case 'saveSettings': {
        requireAccess(user, 'settings', 'write')
        const input = (b.settings ?? {}) as Partial<CompanySettings>
        const settings = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, String(input[k as keyof CompanySettings] ?? '').slice(0, 1000)])) as unknown as CompanySettings
        if (!settings.name.trim()) throw new HttpError(400, 'Company name is required')
        await saveSettings(settings)
        await log(user, 'saveSettings', 'Updated company settings', [{ collection: 'settings', id: '1', op: 'update', after: settings }])
        return json({ settings })
      }
      case 'resetDemo': {
        requireAccess(user, 'settings', 'delete')
        if (b.confirm !== 'RESET') throw new HttpError(400, 'Type RESET to confirm')
        const version = await seedDemoData({ userId: user.id, userName: user.name, action: 'resetDemo', summary: 'Replaced all business data with the demo data', changes: [] })
        return json({ ok: true, version })
      }
      case 'clearBusinessData': {
        requireAccess(user, 'settings', 'delete')
        if (b.confirm !== 'CLEAR') throw new HttpError(400, 'Type CLEAR to confirm')
        const version = await clearBusinessData({ userId: user.id, userName: user.name, action: 'clearBusinessData', summary: 'Cleared all business data to start the pilot', changes: [] })
        return json({ ok: true, version })
      }
      default:
        throw new HttpError(400, 'Unknown action')
    }
  } catch (e) {
    return fail(e)
  }
}
