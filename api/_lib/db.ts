import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import type { Database } from '../../src/data/types.js'
import { DEFAULT_SETTINGS, type CompanySettings } from '../../src/lib/settings.js'

export { DEFAULT_SETTINGS, type CompanySettings }

// ---------------------------------------------------------------------------
// Neon Postgres storage.
//  • Business data: one table per collection, each row the entity as JSONB,
//    keyed by its business id (e.g. 'PRJ-2026-001').
//  • app_meta.version increases on every write. A write states the version it
//    was computed from; if another write got there first it fails with a
//    conflict and the command is re-run on fresh data (no lost updates).
//  • counters: high-water mark per number series, so numbers are never reused.
//  • users / roles / sessions / audit_log / document_files / app_settings.
// ---------------------------------------------------------------------------

export type Collection = keyof Database

/** Database collection → Postgres table. */
export const TABLES: Record<Collection, string> = {
  clients: 'clients',
  projects: 'projects',
  quotations: 'quotations',
  quotationItems: 'quotation_items',
  contracts: 'contracts',
  phases: 'project_phases',
  expenses: 'expenses',
  suppliers: 'suppliers',
  supplierInvoices: 'supplier_invoices',
  supplierPayments: 'supplier_payments',
  clientInvoices: 'client_invoices',
  clientPayments: 'client_payments',
  changeOrders: 'change_orders',
  documents: 'documents',
  closures: 'project_closures',
  cancelled: 'cancelled_records',
}

export const COLLECTIONS = Object.keys(TABLES) as Collection[]
export const isCollection = (c: string): c is Collection => Object.hasOwn(TABLES, c)

let client: NeonQueryFunction<false, false> | null = null
export function sql() {
  if (client) return client
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return (client = neon(url))
}

export class ConflictError extends Error {}

const SYSTEM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS app_meta (id int PRIMARY KEY, version bigint NOT NULL)`,
  `INSERT INTO app_meta (id, version) VALUES (1, 0) ON CONFLICT DO NOTHING`,
  `CREATE OR REPLACE FUNCTION maali_bump_version(expected bigint) RETURNS bigint LANGUAGE plpgsql AS $$
   DECLARE v bigint;
   BEGIN
     SELECT version INTO v FROM app_meta WHERE id = 1 FOR UPDATE;
     IF v <> expected THEN RAISE EXCEPTION 'maali_version_conflict'; END IF;
     UPDATE app_meta SET version = v + 1 WHERE id = 1;
     RETURN v + 1;
   END $$`,
  `CREATE TABLE IF NOT EXISTS counters (prefix text PRIMARY KEY, value bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS roles (
     id text PRIMARY KEY, name text NOT NULL UNIQUE, description text NOT NULL DEFAULT '',
     permissions jsonb NOT NULL, system boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS users (
     id text PRIMARY KEY, username text NOT NULL UNIQUE, name text NOT NULL, email text NOT NULL DEFAULT '',
     role_id text NOT NULL REFERENCES roles(id), password_hash text NOT NULL,
     active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT true,
     failed_logins int NOT NULL DEFAULT 0, locked_until timestamptz,
     last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), version bigint,
     user_id text, user_name text NOT NULL, action text NOT NULL, summary text NOT NULL DEFAULT '',
     changes jsonb NOT NULL DEFAULT '[]')`,
  `CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log(at DESC)`,
  `CREATE TABLE IF NOT EXISTS document_files (
     document_id text PRIMARY KEY, file_name text NOT NULL, mime text NOT NULL, size_bytes int NOT NULL,
     content bytea NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS app_settings (id int PRIMARY KEY, data jsonb NOT NULL)`,
]

let schemaReady: Promise<void> | null = null

/** Create tables if missing (idempotent; runs once per server instance). */
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const q = sql()
    await q.transaction([
      ...COLLECTIONS.map((c) => q.query(
        `CREATE TABLE IF NOT EXISTS ${TABLES[c]} (
           id text PRIMARY KEY, seq bigserial, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
      )),
      ...SYSTEM_SCHEMA.map((s) => q.query(s)),
    ])
  })().catch((e) => { schemaReady = null; throw e })
  return schemaReady
}

export interface Snapshot { db: Database; version: number; counters: Record<string, number> }

/** Whole database, its version and the number counters, read consistently. */
export async function loadSnapshot(): Promise<Snapshot> {
  await ensureSchema()
  const q = sql()
  const union = COLLECTIONS.map((c) => `SELECT '${c}' AS c, seq, data FROM ${TABLES[c]}`).join(' UNION ALL ')
  const [meta, rows, ctr] = await q.transaction([
    q.query('SELECT version FROM app_meta WHERE id = 1'),
    q.query(`SELECT c, data FROM (${union}) t ORDER BY c, seq`),
    q.query('SELECT prefix, value FROM counters'),
  ], { isolationLevel: 'RepeatableRead', readOnly: true }) as [{ version: string }[], { c: Collection; data: unknown }[], { prefix: string; value: string }[]]
  const db = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as Record<Collection, unknown[]>
  for (const r of rows) db[r.c].push(r.data)
  return {
    db: db as unknown as Database,
    version: Number(meta[0]?.version ?? 0),
    counters: Object.fromEntries(ctr.map((r) => [r.prefix, Number(r.value)])),
  }
}

export async function currentVersion(): Promise<number> {
  await ensureSchema()
  const [r] = await sql().query('SELECT version FROM app_meta WHERE id = 1') as { version: string }[]
  return Number(r?.version ?? 0)
}

export interface Changes {
  upserts: Partial<Record<Collection, { id: string }[]>>
  deletes: Partial<Record<Collection, string[]>>
}

export interface AuditEntry { userId: string | null; userName: string; action: string; summary: string; changes: unknown }

export interface FileUpload { documentId: string; fileName: string; mime: string; bytes: Buffer }

/**
 * Write a change set atomically, provided nobody else wrote since `baseVersion`.
 * Throws ConflictError otherwise. Returns the new version.
 */
export async function commitChanges(baseVersion: number, opts: {
  changes: Changes
  counters?: Record<string, number>
  audit: AuditEntry
  file?: FileUpload
  truncate?: boolean
}): Promise<number> {
  await ensureSchema()
  const q = sql()
  const stmts = [q.query('SELECT maali_bump_version($1) AS version', [baseVersion])]
  if (opts.truncate) {
    stmts.push(q.query(`TRUNCATE ${COLLECTIONS.map((c) => TABLES[c]).join(', ')}, counters, document_files RESTART IDENTITY`))
  }
  for (const [c, ids] of Object.entries(opts.changes.deletes)) {
    if (!isCollection(c) || !ids?.length) continue
    stmts.push(q.query(`DELETE FROM ${TABLES[c]} WHERE id = ANY($1::text[])`, [ids]))
    if (c === 'documents') stmts.push(q.query('DELETE FROM document_files WHERE document_id = ANY($1::text[])', [ids]))
  }
  for (const [c, rows] of Object.entries(opts.changes.upserts)) {
    if (!isCollection(c) || !rows?.length) continue
    stmts.push(q.query(
      `INSERT INTO ${TABLES[c]} (id, data)
       SELECT x->>'id', x FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(x, i) ORDER BY i
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(rows)],
    ))
  }
  const ctr = Object.entries(opts.counters ?? {})
  if (ctr.length) {
    stmts.push(q.query(
      `INSERT INTO counters (prefix, value) SELECT key, value::bigint FROM jsonb_each_text($1::jsonb)
       ON CONFLICT (prefix) DO UPDATE SET value = GREATEST(counters.value, EXCLUDED.value)`,
      [JSON.stringify(Object.fromEntries(ctr))],
    ))
  }
  if (opts.file) {
    const f = opts.file
    stmts.push(q.query(
      `INSERT INTO document_files (document_id, file_name, mime, size_bytes, content) VALUES ($1, $2, $3, $4, decode($5, 'base64'))
       ON CONFLICT (document_id) DO UPDATE SET file_name = EXCLUDED.file_name, mime = EXCLUDED.mime, size_bytes = EXCLUDED.size_bytes, content = EXCLUDED.content, uploaded_at = now()`,
      [f.documentId, f.fileName, f.mime, f.bytes.length, f.bytes.toString('base64')],
    ))
  }
  const a = opts.audit
  stmts.push(q.query(
    `INSERT INTO audit_log (version, user_id, user_name, action, summary, changes) VALUES ($1 + 1, $2, $3, $4, $5, $6::jsonb)`,
    [baseVersion, a.userId, a.userName, a.action, a.summary, JSON.stringify(a.changes ?? [])],
  ))
  try {
    const results = await q.transaction(stmts) as unknown[][]
    return Number((results[0][0] as { version: string }).version)
  } catch (e) {
    if (e instanceof Error && e.message.includes('maali_version_conflict')) throw new ConflictError('Data changed while saving')
    throw e
  }
}

/** Record an admin action (users, roles, settings) that does not touch business data. */
export async function logAction(a: AuditEntry): Promise<void> {
  await sql().query(
    `INSERT INTO audit_log (version, user_id, user_name, action, summary, changes) VALUES ((SELECT version FROM app_meta WHERE id = 1), $1, $2, $3, $4, $5::jsonb)`,
    [a.userId, a.userName, a.action, a.summary, JSON.stringify(a.changes ?? [])],
  )
}

// ---- company settings (letterhead for printed documents) ----------------------

export async function loadSettings(): Promise<CompanySettings> {
  await ensureSchema()
  const [r] = await sql().query('SELECT data FROM app_settings WHERE id = 1') as { data: Partial<CompanySettings> }[]
  return { ...DEFAULT_SETTINGS, ...(r?.data ?? {}) }
}

export async function saveSettings(s: CompanySettings): Promise<void> {
  await sql().query(`INSERT INTO app_settings (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify(s)])
}

// ---- HTTP helpers -----------------------------------------------------------

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function fail(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status)
  const message = e instanceof Error ? e.message : String(e)
  console.error('[api]', e)
  return json({ error: message }, 500)
}

/** Mutating requests must carry this header; browsers cannot send it cross-site without CORS. */
export function requireAppRequest(request: Request) {
  if (request.headers.get('x-requested-with') !== 'maali') throw new HttpError(403, 'Missing request header')
}
