import { neon, neonConfig } from '@neondatabase/serverless'

neonConfig.fetchConnectionCache = true

let _sql: ReturnType<typeof neon> | null = null

export function getSql() {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL (or NEON_DATABASE_URL) is not set')
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
}

