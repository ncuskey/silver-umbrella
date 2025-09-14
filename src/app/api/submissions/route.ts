import { NextRequest } from 'next/server'
import { ensureSchema, getSql, isDbConfigured } from '@/lib/db'

type SubmissionListRow = { id: string; student_name: string|null; submitted_at: string|null; duration_seconds: number|null }

export async function GET() {
  try {
    if (!isDbConfigured()) return new Response(JSON.stringify({ error: 'db_unconfigured' }), { status: 503 })
    await ensureSchema()
    const sql = getSql()
    const rows = await (sql as any)`
      select id, student_name, submitted_at, duration_seconds
      from submissions
      order by submitted_at desc
      limit 50
    ` as SubmissionListRow[]
    return new Response(JSON.stringify({ items: rows }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isDbConfigured()) return new Response(JSON.stringify({ error: 'db_unconfigured' }), { status: 503 })
    await ensureSchema()
    const body = await req.json()
    const id = body?.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const student = (body?.student ?? '').toString() || null
    const content = (body?.text ?? body?.content ?? '').toString()
    const duration = Number.isFinite(+body?.durationSeconds) ? parseInt(body.durationSeconds, 10) : (Number.isFinite(+body?.duration) ? parseInt(body.duration, 10) : null)
    const startedAt = body?.startedAt ? new Date(body.startedAt) : null
    const promptId = body?.promptId ? String(body.promptId) : null
    const promptText = body?.promptText ? String(body.promptText) : null
    if (!content) return new Response(JSON.stringify({ error: 'content required' }), { status: 400 })
    const sql = getSql()
    await sql`
      insert into submissions (id, student_name, content, duration_seconds, started_at, prompt_id, prompt_text)
      values (${id}, ${student}, ${content}, ${duration}, ${startedAt}, ${promptId}, ${promptText})
      on conflict (id) do nothing
    `
    return new Response(JSON.stringify({ id }), { status: 201, headers: { 'content-type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
