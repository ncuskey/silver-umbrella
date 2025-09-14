import { neon, neonConfig } from '@neondatabase/serverless'

neonConfig.fetchConnectionCache = true

let _sql: ReturnType<typeof neon> | null = null

function getDbUrl(): string | null {
  const keys = [
    'NETLIFY_DATABASE_URL',
    'NEON_DATABASE_URL',
    'DATABASE_URL',
    'NETLIFY_DATABASE_URL_UNPOOLED',
  ] as const
  for (const k of keys) {
    const v = process.env[k as keyof NodeJS.ProcessEnv]
    if (v && typeof v === 'string' && v.trim()) return v
  }
  return null
}

export function isDbConfigured() {
  return !!getDbUrl()
}

export function getSql() {
  const url = getDbUrl()
  if (!url) throw new Error('Database URL not set. Set NETLIFY_DATABASE_URL (or NEON_DATABASE_URL / DATABASE_URL).')
  if (_sql) return _sql
  _sql = neon(url)
  return _sql
}

export async function ensureSchema() {
  const sql = getSql()
  await sql`
    create table if not exists submissions (
      id text primary key,
      student_name text,
      content text not null,
      duration_seconds integer,
      started_at timestamptz,
      submitted_at timestamptz default now()
    );
  `
  // prompts table
  await sql`
    create table if not exists prompts (
      id text primary key,
      title text not null,
      content text not null,
      created_at timestamptz default now()
    );
  `
  // add optional prompt linkage on submissions
  await sql`alter table submissions add column if not exists prompt_id text;`
  await sql`alter table submissions add column if not exists prompt_text text;`
}
