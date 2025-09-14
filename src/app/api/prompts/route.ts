import { NextRequest } from 'next/server'
import { ensureSchema, getSql, isDbConfigured } from '@/lib/db'

export async function GET() {
  try {
    if (!isDbConfigured()) return new Response(JSON.stringify({ error: 'db_unconfigured' }), { status: 503 })
    await ensureSchema()
    const sql = getSql()
    const rows = await sql<{ id: string, title: string, content: string, created_at: string }[]>`
      select id, title, content, created_at from prompts order by created_at desc limit 100
    `
    return new Response(JSON.stringify({ items: rows }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isDbConfigured()) return new Response(JSON.stringify({ error: 'db_unconfigured' }), { status: 503 })
    await ensureSchema()
    const { title, content } = await req.json()
    const t = (title || '').toString().trim()
    const c = (content || '').toString().trim()
    if (!t || !c) return new Response(JSON.stringify({ error: 'title and content required' }), { status: 400 })
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const sql = getSql()
    await sql`insert into prompts (id, title, content) values (${id}, ${t}, ${c})`
    return new Response(JSON.stringify({ id }), { status: 201, headers: { 'content-type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}
