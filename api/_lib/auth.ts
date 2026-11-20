import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ADMIN_ROLE_ID, can, fullAccess, normalizePermissions, type Level, type MenuKey, type Permissions } from '../../src/lib/permissions.js'
import { ensureSchema, HttpError, sql } from './db.js'

// Username + password sign-in. Passwords are hashed with scrypt; sessions are
// random tokens kept in an HttpOnly cookie, stored server-side only as a hash.

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

const COOKIE = 'maali_session'
const SESSION_DAYS = 7
const MAX_FAILED = 5
const LOCK_MINUTES = 15
export const MIN_PASSWORD = 8

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, salt, key] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

export function checkPasswordStrength(pw: unknown): string {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`)
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'Password must contain letters and numbers')
  if (pw !== pw.trim()) throw new HttpError(400, 'Password cannot start or end with a space')
  return pw
}

/** A readable one-time password for new users and resets. */
export function temporaryPassword(): string {
  const words = 'Brick Steel Cement Beam Pillar Slab Arch Truss Girder Mortar'.split(' ')
  return `${words[randomBytes(1)[0] % words.length]}-${randomBytes(3).toString('hex')}-${10 + (randomBytes(1)[0] % 90)}`
}

const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex')

export interface SessionUser {
  id: string
  username: string
  name: string
  email: string
  roleId: string
  roleName: string
  permissions: Permissions
  mustChangePassword: boolean
}

interface UserRow {
  id: string; username: string; name: string; email: string; role_id: string; role_name: string
  permissions: unknown; active: boolean; must_change_password: boolean
}

const toSessionUser = (r: UserRow): SessionUser => ({
  id: r.id, username: r.username, name: r.name, email: r.email, roleId: r.role_id, roleName: r.role_name,
  // The Administrator role always has full access, whatever is stored.
  permissions: r.role_id === ADMIN_ROLE_ID ? fullAccess() : normalizePermissions(r.permissions as Permissions),
  mustChangePassword: r.must_change_password,
})

function readCookie(request: Request): string | null {
  const m = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

const isHttps = (request: Request) =>
  request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:'

export function sessionCookie(request: Request, token: string | null): string {
  const secure = isHttps(request) ? '; Secure' : ''
  return token
    ? `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
    : `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
}

/** The signed-in user, or null. */
export async function currentUser(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request)
  if (!token) return null
  await ensureSchema()
  const rows = await sql().query(
    `SELECT u.id, u.username, u.name, u.email, u.role_id, r.name AS role_name, r.permissions, u.active, u.must_change_password
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [tokenHash(token)],
  ) as UserRow[]
  return rows[0] ? toSessionUser(rows[0]) : null
}

/** Signed-in user or 401. Users who must change their password can do nothing else. */
export async function requireUser(request: Request, opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await currentUser(request)
  if (!user) throw new HttpError(401, 'Please sign in')
  if (user.mustChangePassword && !opts.allowPasswordChange) throw new HttpError(403, 'Change your password to continue')
  return user
}

export function requireAccess(user: SessionUser, menu: MenuKey, level: Level) {
  if (!can(user.permissions, menu, level)) {
    throw new HttpError(403, `Your role (${user.roleName}) does not have ${level} access to ${menu}`)
  }
}

export async function login(username: string, password: string): Promise<{ token: string; user: SessionUser }> {
  await ensureSchema()
  const q = sql()
  const rows = await q.query(
    `SELECT u.*, r.name AS role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE lower(u.username) = lower($1)`,
    [username],
  ) as (UserRow & { password_hash: string; failed_logins: number; locked_until: string | null })[]
  const u = rows[0]
  const invalid = new HttpError(401, 'Invalid username or password')
  if (!u) { await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '=='); throw invalid }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    throw new HttpError(429, `Too many failed attempts. Try again after ${new Date(u.locked_until).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`)
  }
  if (!(await verifyPassword(password, u.password_hash))) {
    await q.query(
      `UPDATE users SET
         locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END,
         failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END
       WHERE id = $1`,
      [u.id, MAX_FAILED, LOCK_MINUTES],
    )
    throw invalid
  }
  if (!u.active) throw new HttpError(403, 'This account is disabled. Contact your administrator.')
  const token = randomBytes(32).toString('base64url')
  await q.transaction([
    q.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]),
    q.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [tokenHash(token), u.id, SESSION_DAYS]),
    q.query('DELETE FROM sessions WHERE expires_at < now()'),
  ])
  return { token, user: toSessionUser(u) }
}

export async function logout(request: Request) {
  const token = readCookie(request)
  if (token) await sql().query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)])
}

export async function changePassword(request: Request, user: SessionUser, current: string, next: string) {
  checkPasswordStrength(next)
  if (current === next) throw new HttpError(400, 'Choose a password different from the current one')
  const [row] = await sql().query('SELECT password_hash FROM users WHERE id = $1', [user.id]) as { password_hash: string }[]
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new HttpError(400, 'Current password is incorrect')
  const token = readCookie(request)
  const q = sql()
  await q.transaction([
    q.query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [user.id, await hashPassword(next)]),
    // Sign out every other device.
    q.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, token ? tokenHash(token) : '']),
  ])
}
