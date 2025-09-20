import { NextResponse } from "next/server";

const DEFAULT_LT_BASE = "http://languagetool:8010";
const DEFAULT_DISABLE_RULES = [
  "PASSIVE_VOICE",
  "PASSIVE_VOICE_SIMPLE",
  "TOO_WORDY",
  "WORDINESS",
  "REDUNDANT_EXPRESSION",
  "WEASEL_WORDS"
];

function buildLtUrl(path: string) {
  const base = process.env.LT_BASE_URL || process.env.LANGUAGETOOL_URL || DEFAULT_LT_BASE;
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

export async function POST(req: Request) {
  const body = await req.text(); // x-www-form-urlencoded passthrough
  const params = new URLSearchParams(body);
  if (!params.has("language")) params.set("language", "en-US");
  if (!params.has("level")) params.set("level", "picky");
  if (!params.has("enabledOnly")) params.set("enabledOnly", "false");
  if (!params.has("disabledRules")) {
    DEFAULT_DISABLE_RULES.forEach(rule => params.append("disabledRules", rule));
  }

  const upstream = await fetch(buildLtUrl("/v2/check"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const json = await upstream.json().catch(() => ({}));
  return NextResponse.json(json, { status: upstream.status });
}
