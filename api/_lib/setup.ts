import { createSeed } from '../../src/data/seed.js'
import type { Database } from '../../src/data/types.js'
import { ADMIN_ROLE_ID, DEFAULT_ROLES } from '../../src/lib/permissions.js'
import { hashPassword, temporaryPassword } from './auth.js'
import { COLLECTIONS, commitChanges, currentVersion, ensureSchema, sql, type AuditEntry } from './db.js'

/** Insert the default roles that do not exist yet (never overwrites edited roles). */
export async function ensureRoles() {
  await ensureSchema()
  const q = sql()
  await q.transaction(DEFAULT_ROLES.map((r) => q.query(
    `INSERT INTO roles (id, name, description, permissions, system) VALUES ($1, $2, $3, $4::jsonb, $5) ON CONFLICT (id) DO NOTHING`,
    [r.id, r.name, r.description, JSON.stringify(r.permissions), !!r.system],
  )))
}

/** Create the first administrator if there are no users. Returns the one-time password, or null. */
export async function ensureAdmin(username = 'admin', name = 'Administrator'): Promise<string | null> {
  await ensureRoles()
  const [{ n }] = await sql().query('SELECT count(*)::int AS n FROM users') as { n: number }[]
  if (n > 0) return null
  const password = temporaryPassword()
  await sql().query(
    `INSERT INTO users (id, username, name, role_id, password_hash, must_change_password) VALUES ('USR-001', $1, $2, $3, $4, true)`,
    [username, name, ADMIN_ROLE_ID, await hashPassword(password)],
  )
  return password
}

const empty = (): Database => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as Database

/** Replace all business data (users, roles and settings are kept). */
export async function replaceBusinessData(db: Database, audit: AuditEntry) {
  const upserts = Object.fromEntries(COLLECTIONS.map((c) => [c, db[c] ?? []]))
  return commitChanges(await currentVersion(), { changes: { upserts, deletes: {} }, truncate: true, audit })
}

export const seedDemoData = (audit: AuditEntry) => replaceBusinessData(createSeed(), audit)
export const clearBusinessData = (audit: AuditEntry) => replaceBusinessData(empty(), audit)
