import type { Database } from '../../src/data/types.js'
import { auditDatabase, type AuditIssue } from '../../src/lib/audit.js'
import { isRuleError, withCounters } from '../../src/store/actions.js'
import { COMMANDS, FILE_COMMANDS, runCommand, type CommandName } from '../../src/store/commands.js'
import { diffDatabase, hasChanges } from '../../src/store/sync.js'
import { requireAccess, type SessionUser } from './auth.js'
import { commitChanges, ConflictError, HttpError, loadSnapshot, type Changes, type FileUpload } from './db.js'

const MAX_ATTEMPTS = 5
const issueKey = (i: AuditIssue) => `${i.table}|${i.id}|${i.message}`

/**
 * Integrity check on the result of a command: it may not introduce any new
 * integrity error (unknown references, payments above invoice, amount ≠ qty × rate,
 * status vs billing …). Agreed-value drift (soft) is allowed.
 */
export function validateTransition(prev: Database, next: Database) {
  const before = new Set(auditDatabase(prev).filter((i) => i.level === 'error').map(issueKey))
  const introduced = auditDatabase(next).filter((i) => i.level === 'error' && !i.soft && !before.has(issueKey(i)))
  if (introduced.length) {
    const list = introduced.slice(0, 3).map((i) => `${i.id}: ${i.message}`).join('; ')
    throw new HttpError(422, `Not saved — this would make the data inconsistent (${list}${introduced.length > 3 ? ` and ${introduced.length - 3} more` : ''})`)
  }
}

/** Before/after rows for the activity log. */
function describe(prev: Database, changes: Changes) {
  const out: { collection: string; id: string; op: 'insert' | 'update' | 'delete'; before?: unknown; after?: unknown }[] = []
  for (const [c, rows] of Object.entries(changes.upserts)) {
    const old = new Map((prev[c as keyof Database] as { id: string }[]).map((r) => [r.id, r]))
    for (const r of rows ?? []) out.push({ collection: c, id: r.id, op: old.has(r.id) ? 'update' : 'insert', before: old.get(r.id), after: r })
  }
  for (const [c, ids] of Object.entries(changes.deletes)) {
    const old = new Map((prev[c as keyof Database] as { id: string }[]).map((r) => [r.id, r]))
    for (const id of ids ?? []) out.push({ collection: c, id, op: 'delete', before: old.get(id) })
  }
  return out
}

export interface ExecuteResult { result: unknown; changes: Changes; version: number; baseVersion: number }

export async function execute(user: SessionUser, name: CommandName, args: unknown, opts: { summary?: string; file?: Omit<FileUpload, 'documentId'> } = {}): Promise<ExecuteResult> {
  const def = COMMANDS[name]
  requireAccess(user, def.menu, def.level)
  if (!Array.isArray(args)) throw new HttpError(400, 'args must be an array')
  if (opts.file && !FILE_COMMANDS.includes(name)) throw new HttpError(400, `${name} does not take a file`)

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const snap = await loadSnapshot()
    const counters = { ...snap.counters }
    let next: Database, result: unknown
    try {
      [next, result] = withCounters(counters, () => runCommand(snap.db, { user: user.name }, name, structuredClone(args)))
    } catch (e) {
      if (isRuleError(e)) throw new HttpError(400, e.message)
      if (e instanceof TypeError) throw new HttpError(400, `Invalid input for ${name}`)
      throw e
    }
    validateTransition(snap.db, next)
    const changes = diffDatabase(snap.db, next)
    if (!hasChanges(changes)) return { result, changes, version: snap.version, baseVersion: snap.version }

    const issued = Object.fromEntries(Object.entries(counters).filter(([k, v]) => snap.counters[k] !== v))
    const file = opts.file && { ...opts.file, documentId: (result as { id: string }).id }
    try {
      const version = await commitChanges(snap.version, {
        changes,
        counters: issued,
        file,
        audit: { userId: user.id, userName: user.name, action: name, summary: (opts.summary ?? '').slice(0, 300), changes: describe(snap.db, changes) },
      })
      return { result, changes, version, baseVersion: snap.version }
    } catch (e) {
      if (e instanceof ConflictError) continue // someone saved first: re-run on their data
      throw e
    }
  }
  throw new HttpError(409, 'The system is busy; please try again')
}
