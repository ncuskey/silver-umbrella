import { Pool, PoolConfig, QueryResult, type QueryResultRow } from 'pg'

type SqlTag = {
  <T extends QueryResultRow = QueryResultRow>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]>;
  query<T extends QueryResultRow = QueryResultRow>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]>;
  raw: <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) => Promise<QueryResult<T>>;
};

let pool: Pool | null = null;
let sqlTag: SqlTag | null = null;

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
  if (sqlTag) return sqlTag

  if (!pool) {
    const config: PoolConfig = { connectionString: url }
    const sslMode = (process.env.PGSSLMODE || process.env.PG_SSL_MODE || '').toLowerCase()
    const forceSSL = process.env.PGSSL === '1' || process.env.PG_SSL === '1'
    const shouldUseSSL = forceSSL || (!sslMode && /neon\.tech|supabase\.co|amazonaws\.com|render\.com/i.test(url)) || (sslMode && sslMode !== 'disable')
    if (shouldUseSSL) {
      config.ssl = { rejectUnauthorized: false }
    }
    pool = new Pool(config)
  }

  const buildQuery = (strings: TemplateStringsArray, values: any[]) => {
    let text = ''
    for (let i = 0; i < strings.length; i++) {
      text += strings[i]
      if (i < values.length) text += `$${i + 1}`
    }
    return { text, values }
  }

  const tag = (async <T extends QueryResultRow = QueryResultRow>(strings: TemplateStringsArray, ...values: any[]) => {
    const { text, values: params } = buildQuery(strings, values)
    const res = await pool!.query<T>(text, params)
    return res.rows
  }) as SqlTag

  tag.query = tag
  tag.raw = async <T extends QueryResultRow = QueryResultRow>(text: string, params: any[] = []) => {
    return pool!.query<T>(text, params)
  }

  sqlTag = tag
  return sqlTag
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
  await sql`
    create table if not exists generator_samples (
      id text primary key,
      source text,
      original_text text not null,
      fixed_text text,
      grammar_edits jsonb,
      llama_verdict jsonb,
      tww integer,
      wsc integer,
      cws integer,
      eligible integer,
      minutes numeric,
      created_at timestamptz default now()
    );
  `
  await sql`create index if not exists generator_samples_created_at_idx on generator_samples (created_at desc);`
}
