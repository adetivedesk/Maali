// Database admin against DATABASE_URL (read from .env.local).
//   npm run db:migrate   create tables, default roles and the first admin user
//   npm run db:seed      replace all business data with the demo seed (users kept)
//   npm run db:clear     delete all business data (users, roles, settings kept)
//   npm run db:status    row count per table
//   npm run db:admin -- <username>   reset that user's password (prints a one-time password)
import { ensureSchema, loadSnapshot, COLLECTIONS, TABLES, sql } from '../api/_lib/db'
import { ensureAdmin, seedDemoData, clearBusinessData } from '../api/_lib/setup'
import { hashPassword, temporaryPassword } from '../api/_lib/auth'

const audit = (action: string, summary: string) => ({ userId: null, userName: 'System (CLI)', action, summary, changes: [] })
const [cmd, arg] = process.argv.slice(2)

async function migrate() {
  await ensureSchema()
  const pw = await ensureAdmin()
  console.log('Schema ready.')
  if (pw) console.log(`\nFirst administrator created:\n  username: admin\n  password: ${pw}\n(must be changed at first sign-in)\n`)
}

if (cmd === 'migrate') {
  await migrate()
} else if (cmd === 'seed') {
  await migrate()
  await seedDemoData(audit('seed', 'Loaded demo data (CLI)'))
  console.log('Demo data loaded.')
} else if (cmd === 'clear') {
  await clearBusinessData(audit('clearBusinessData', 'Cleared business data (CLI)'))
  console.log('Business data cleared.')
} else if (cmd === 'status') {
  const { db, version } = await loadSnapshot()
  for (const c of COLLECTIONS) console.log(`${TABLES[c].padEnd(18)} ${db[c].length}`)
  const users = await sql().query('SELECT username, role_id, active FROM users ORDER BY id') as { username: string; role_id: string; active: boolean }[]
  console.log(`\nversion ${version}; users: ${users.map((u) => `${u.username} (${u.role_id}${u.active ? '' : ', disabled'})`).join(', ')}`)
} else if (cmd === 'admin' && arg) {
  const pw = temporaryPassword()
  const r = await sql().query('UPDATE users SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL, active = true WHERE lower(username) = lower($1) RETURNING id', [arg, await hashPassword(pw)])
  if (!r.length) { console.error(`No user ${arg}`); process.exit(1) }
  await sql().query('DELETE FROM sessions WHERE user_id = $1', [(r[0] as { id: string }).id])
  console.log(`Password for ${arg} reset to: ${pw}  (must be changed at sign-in)`)
} else {
  console.error('Usage: tsx --env-file=.env.local scripts/db.ts migrate|seed|clear|status|admin <username>')
  process.exit(1)
}
