import { isCommandName } from '../src/store/commands.js'
import { requireUser } from './_lib/auth.js'
import { fail, HttpError, json, requireAppRequest } from './_lib/db.js'
import { execute } from './_lib/execute.js'

/** POST /api/command — { name, args, summary }: run one business command for the signed-in user. */
export async function POST(request: Request) {
  try {
    requireAppRequest(request)
    const user = await requireUser(request)
    const body = await request.json().catch(() => null) as { name?: unknown; args?: unknown; summary?: unknown } | null
    if (!body || !isCommandName(body.name)) throw new HttpError(400, 'Unknown command')
    const out = await execute(user, body.name, body.args, { summary: typeof body.summary === 'string' ? body.summary : undefined })
    return json(out)
  } catch (e) {
    return fail(e)
  }
}
