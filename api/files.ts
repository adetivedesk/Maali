import { FILE_COMMANDS, isCommandName } from '../src/store/commands.js'
import { requireAccess, requireUser } from './_lib/auth.js'
import { ensureSchema, fail, HttpError, json, requireAppRequest, sql } from './_lib/db.js'
import { execute } from './_lib/execute.js'

// Document files are stored in Postgres (bytea). Vercel caps a request body at
// 4.5 MB, so uploads are limited to 4 MB.

export const MAX_FILE_BYTES = 4 * 1024 * 1024

/** Only document and image types: never HTML/SVG, which could run script on this origin. */
const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
}
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])

const safeName = (n: string) => n.replace(/[^\w.\- ()]+/g, '_').slice(0, 150) || 'file'

/**
 * POST /api/files — raw file body; headers x-file-name and
 * x-command (URI-encoded JSON { name, args, summary }) naming the command that creates the document record.
 */
export async function POST(request: Request) {
  try {
    requireAppRequest(request)
    const user = await requireUser(request)
    const fileName = safeName(decodeURIComponent(request.headers.get('x-file-name') ?? ''))
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    const mime = ALLOWED[ext]
    if (!mime) throw new HttpError(415, `File type .${ext} is not allowed. Use PDF, images, Excel, Word or CSV.`)
    let command: { name?: unknown; args?: unknown; summary?: unknown }
    try { command = JSON.parse(decodeURIComponent(request.headers.get('x-command') ?? '')) } catch { throw new HttpError(400, 'Invalid x-command header') }
    if (!isCommandName(command.name) || !FILE_COMMANDS.includes(command.name)) throw new HttpError(400, 'This command does not take a file')
    const bytes = Buffer.from(await request.arrayBuffer())
    if (bytes.length === 0) throw new HttpError(400, 'The file is empty')
    if (bytes.length > MAX_FILE_BYTES) throw new HttpError(413, 'File is larger than 4 MB')
    const out = await execute(user, command.name, command.args, {
      summary: typeof command.summary === 'string' ? command.summary : undefined,
      file: { fileName, mime, bytes },
    })
    return json(out)
  } catch (e) {
    return fail(e)
  }
}

/** GET /api/files?id=DOC-001 — download (or view inline) a stored document file. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    requireAccess(user, 'documents', 'read')
    const id = new URL(request.url).searchParams.get('id') ?? ''
    await ensureSchema()
    const [f] = await sql().query(`SELECT file_name, mime, encode(content, 'base64') AS b64 FROM document_files WHERE document_id = $1`, [id]) as { file_name: string; mime: string; b64: string }[]
    if (!f) throw new HttpError(404, 'No file is stored for this document (demo records have none)')
    const name = safeName(f.file_name)
    return new Response(Buffer.from(f.b64, 'base64'), {
      headers: {
        'content-type': f.mime,
        'content-disposition': `${INLINE.has(f.mime) ? 'inline' : 'attachment'}; filename="${name}"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    return fail(e)
  }
}
