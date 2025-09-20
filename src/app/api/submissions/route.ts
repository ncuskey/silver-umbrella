import { NextRequest } from 'next/server'
import { ensureSchema, getSql, isDbConfigured } from '@/lib/db'

type SubmissionListRow = { id: string; student_name: string|null; submitted_at: string|null; duration_seconds: number|null }

const CACHE_HEADERS = {
  'content-type': 'application/json',
  'Cache-Control': 'no-store',
} as const

function json(body: any, status: number) {
  return new Response(JSON.stringify(body), { status, headers: CACHE_HEADERS })
}

function isDbError(err: unknown) {
  const code = (err as any)?.code
  if (typeof code === 'string') {
    const normalized = code.toUpperCase()
    if ([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'EPIPE',
      '57P01',
      '08001',
      '08006',
      '28P01',
    ].includes(normalized)) return true
  }
  const message = (err as any)?.message
  if (typeof message === 'string') {
    const lowered = message.toLowerCase()
    if (/(connection|timeout|refused|unavailable|terminated)/.test(lowered)) return true
  }
  return false
}

function getAuthToken() {
  return process.env.SUBMISSIONS_API_KEY
    || process.env.ADMIN_API_KEY
    || process.env.API_AUTH_TOKEN
    || process.env.AUTH_TOKEN
}

function isAuthorized(req: NextRequest) {
  const token = getAuthToken()
  if (!token) return false

  const authHeader = req.headers.get('authorization') || ''
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === token) {
    return true
  }

  const basicPrefix = 'Basic '
  if (authHeader.startsWith(basicPrefix)) {
    const decoded = Buffer.from(authHeader.slice(basicPrefix.length), 'base64').toString('utf8')
    // support "token:" or ":token" formats for simplicity
    const [user, pass] = decoded.split(':')
    if (pass ? pass === token : user === token) return true
  }

  const apiKey = req.headers.get('x-api-key')
  if (apiKey && apiKey === token) return true

  return false
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401)
}

function validatePagination(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const limitStr = params.get('limit')
  const offsetStr = params.get('offset')

  const limit = limitStr == null || limitStr === '' ? 50 : Number(limitStr)
  const offset = offsetStr == null || offsetStr === '' ? 0 : Number(offsetStr)

  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
    return { error: json({ error: "Invalid 'limit' parameter" }, 400) }
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
    return { error: json({ error: "Invalid 'offset' parameter" }, 400) }
  }

  return { limit: Math.floor(limit), offset }
}

function parseOptionalInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round(num)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const pagination = validatePagination(req)
  if ('error' in pagination) return pagination.error

  try {
    if (!isDbConfigured()) return json({ error: 'db_unconfigured' }, 503)
    await ensureSchema()
    const sql = getSql()
    const rows = await (sql as any)`
      select id, student_name, submitted_at, duration_seconds
      from submissions
      order by submitted_at desc
      offset ${pagination.offset}
      limit ${pagination.limit}
    ` as SubmissionListRow[]
    return json({ items: rows }, 200)
  } catch (e: any) {
    if (isDbError(e)) return json({ error: 'DB unavailable' }, 503)
    return json({ error: e?.message || 'error' }, 500)
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  try {
    if (!isDbConfigured()) return json({ error: 'db_unconfigured' }, 503)
    await ensureSchema()
    const body = await req.json()
    const id = body?.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const student = (body?.student ?? '').toString() || null
    const content = (body?.text ?? body?.content ?? '').toString()
    const duration = parseOptionalInteger(body?.durationSeconds ?? body?.duration)
    const startedAt = body?.startedAt ? new Date(body.startedAt) : null
    const promptId = body?.promptId ? String(body.promptId) : null
    const promptText = body?.promptText ? String(body.promptText) : null
    if (!content) return json({ error: 'content required' }, 400)
    const sql = getSql()
    await sql`
      insert into submissions (id, student_name, content, duration_seconds, started_at, prompt_id, prompt_text)
      values (${id}, ${student}, ${content}, ${duration}, ${startedAt}, ${promptId}, ${promptText})
      on conflict (id) do nothing
    `
    return json({ id }, 201)
  } catch (e: any) {
    if (isDbError(e)) return json({ error: 'DB unavailable' }, 503)
    return json({ error: e?.message || 'error' }, 500)
  }
}
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
