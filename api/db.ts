import { requireUser } from './_lib/auth.js'
import { currentVersion, fail, json, loadSettings, loadSnapshot } from './_lib/db.js'

/**
 * GET /api/db — the whole database with its version and company settings.
 * GET /api/db?check=1 — just the version, polled by open browsers to pick up other users' changes.
 */
export async function GET(request: Request) {
  try {
    await requireUser(request)
    if (new URL(request.url).searchParams.has('check')) return json({ version: await currentVersion() })
    const [snap, settings] = await Promise.all([loadSnapshot(), loadSettings()])
    return json({ db: snap.db, version: snap.version, settings })
  } catch (e) {
    return fail(e)
  }
}
