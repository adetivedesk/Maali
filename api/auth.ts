import { changePassword, currentUser, login, logout, requireUser, sessionCookie } from './_lib/auth.js'
import { fail, HttpError, json, logAction, requireAppRequest } from './_lib/db.js'

/** GET /api/auth — the signed-in user (or null). */
export async function GET(request: Request) {
  try {
    return json({ user: await currentUser(request) })
  } catch (e) {
    return fail(e)
  }
}

/** POST /api/auth — { action: 'login' | 'logout' | 'changePassword', … } */
export async function POST(request: Request) {
  try {
    requireAppRequest(request)
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    switch (body.action) {
      case 'login': {
        const username = String(body.username ?? '').trim()
        const password = String(body.password ?? '')
        if (!username || !password) throw new HttpError(400, 'Enter your username and password')
        const { token, user } = await login(username, password)
        await logAction({ userId: user.id, userName: user.name, action: 'login', summary: `${user.username} signed in`, changes: [] })
        return json({ user }, 200, { 'set-cookie': sessionCookie(request, token) })
      }
      case 'logout':
        await logout(request)
        return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, null) })
      case 'changePassword': {
        const user = await requireUser(request, { allowPasswordChange: true })
        await changePassword(request, user, String(body.current ?? ''), String(body.next ?? ''))
        await logAction({ userId: user.id, userName: user.name, action: 'changePassword', summary: `${user.username} changed their password`, changes: [] })
        return json({ user: { ...user, mustChangePassword: false } })
      }
      default:
        throw new HttpError(400, 'Unknown action')
    }
  } catch (e) {
    return fail(e)
  }
}
