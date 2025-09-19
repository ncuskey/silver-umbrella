import { NextRequest } from 'next/server'
import { ensureSchema, getSql, isDbConfigured } from '@/lib/db'

type SampleRow = {
  id: string
  source: string | null
  original_text: string
  fixed_text: string | null
  grammar_edits: any
  llama_verdict: any
  tww: number | null
  wsc: number | null
  cws: number | null
  eligible: number | null
  minutes: number | null
  created_at: string
}

const DEFAULT_LIMIT = 25

export async function GET(req: NextRequest) {
  try {
    if (!isDbConfigured()) return new Response(JSON.stringify({ error: 'db_unconfigured' }), { status: 503 })
    await ensureSchema()
    const sql = getSql()

    const { searchParams } = new URL(req.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1), 100)

    const rows = await sql<SampleRow>`
      select
        id,
        source,
        original_text,
        fixed_text,
        grammar_edits,
        llama_verdict,
        tww,
        wsc,
        cws,
        eligible,
        minutes,
        created_at
      from generator_samples
      order by created_at desc
      limit ${limit}
    `

    return new Response(JSON.stringify({ items: rows }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isDbConfigured()) return new Response(JSON.stringify({ error: 'db_unconfigured' }), { status: 503 })
    await ensureSchema()

    const body = await req.json()
    const id: string = body?.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const source: string | null = body?.source ? String(body.source) : null
    const originalText: string = (body?.originalText ?? body?.text ?? '').toString()
    const fixedText: string | null = body?.fixedText ? String(body.fixedText) : null
    const grammarEdits = body?.grammarEdits ?? body?.edits ?? null
    const llamaVerdict = body?.llamaVerdict ?? null

    if (!originalText) {
      return new Response(JSON.stringify({ error: 'originalText required' }), { status: 400 })
    }

    const metrics = body?.metrics ?? {}
    const tww = Number.isFinite(+metrics.tww) ? Number(metrics.tww) : null
    const wsc = Number.isFinite(+metrics.wsc) ? Number(metrics.wsc) : null
    const cws = Number.isFinite(+metrics.cws) ? Number(metrics.cws) : null
    const eligible = Number.isFinite(+metrics.eligible) ? Number(metrics.eligible) : null
    const minutes = Number.isFinite(+metrics.minutes) ? Number(metrics.minutes) : null

    const sql = getSql()
    await sql`
      insert into generator_samples (
        id,
        source,
        original_text,
        fixed_text,
        grammar_edits,
        llama_verdict,
        tww,
        wsc,
        cws,
        eligible,
        minutes
      ) values (
        ${id},
        ${source},
        ${originalText},
        ${fixedText},
        ${grammarEdits},
        ${llamaVerdict},
        ${tww},
        ${wsc},
        ${cws},
        ${eligible},
        ${minutes}
      )
      on conflict (id) do update set
        source = excluded.source,
        original_text = excluded.original_text,
        fixed_text = excluded.fixed_text,
        grammar_edits = excluded.grammar_edits,
        llama_verdict = excluded.llama_verdict,
        tww = excluded.tww,
        wsc = excluded.wsc,
        cws = excluded.cws,
        eligible = excluded.eligible,
        minutes = excluded.minutes
    `

    return new Response(JSON.stringify({ id }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'error' }), { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
