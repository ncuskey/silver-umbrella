import { NextResponse } from "next/server";

const DEFAULT_LT_BASE = "http://languagetool:8010";

function buildLtUrl(path: string) {
  const base = process.env.LT_BASE_URL || process.env.LANGUAGETOOL_URL || DEFAULT_LT_BASE;
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

export async function POST(req: Request) {
  const body = await req.text(); // x-www-form-urlencoded passthrough
  const upstream = await fetch(buildLtUrl("/v2/check"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await upstream.json().catch(() => ({}));
  return NextResponse.json(json, { status: upstream.status });
}
