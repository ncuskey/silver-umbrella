import { ensureSchema, getSql } from '@/lib/db'

export async function GET(_req: Request, { params }: any) {
  try {
    await ensureSchema()
    const sql = getSql()
    const id = params?.id
    const rows = await sql<{ id: string, title: string, content: string, created_at: string }[]>`
      select id, title, content, created_at from prompts where id = ${id} limit 1
    `
    if (!rows.length) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    return new Response(JSON.stringify(rows[0]), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
