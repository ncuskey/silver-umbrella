import { ensureSchema, getSql, isDbConfigured } from '@/lib/db'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    if (!isDbConfigured()) return new Response(JSON.stringify({ error: 'db_unconfigured' }), { status: 503 })
    await ensureSchema()
    const sql = getSql()
    const id = ctx.params.id
    const rows = await sql<{ id: string, student_name: string|null, content: string, submitted_at: string|null, duration_seconds: number|null, started_at: string|null }[]>`
      select id, student_name, content, submitted_at, duration_seconds, started_at
      from submissions
      where id = ${id}
      limit 1
    `
    if (!rows.length) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    return new Response(JSON.stringify(rows[0]), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
