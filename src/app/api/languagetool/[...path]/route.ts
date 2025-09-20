import { NextRequest, NextResponse } from "next/server";

const DEFAULT_LT_BASE = "http://languagetool:8010";
const DEFAULT_DISABLE_RULES = [
  "PASSIVE_VOICE",
  "PASSIVE_VOICE_SIMPLE",
  "TOO_WORDY",
  "WORDINESS",
  "REDUNDANT_EXPRESSION",
  "WEASEL_WORDS"
];

function ltBase() {
  return process.env.LT_BASE_URL || process.env.LANGUAGETOOL_URL || DEFAULT_LT_BASE;
}

function buildLtUrl(path: string) {
  const base = ltBase();
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

/**
 * Proxies any path under /api/languagetool/* to the upstream LanguageTool service.
 * Example: POST /api/languagetool/v2/check -> http://languagetool:8010/v2/check (default)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const form = await req.formData();
  const resolvedParams = await params;
  const subpath = (resolvedParams.path || []).join("/");
  const upstreamUrl = buildLtUrl(`/${subpath || "v2/check"}`);

  // Pass through ALL client params as-is
  const params_obj = new URLSearchParams();
  for (const [k, v] of form.entries()) params_obj.append(k, String(v));

  // Default to picky US English unless caller overrides
  if (!params_obj.has("language")) params_obj.set("language", "en-US");
  if (!params_obj.has("level")) params_obj.set("level", "picky");
  if (!params_obj.has("enabledOnly")) params_obj.set("enabledOnly", "false");

  if (!form.has("disabledRules")) {
    params_obj.delete("disabledRules");
    DEFAULT_DISABLE_RULES.forEach(rule => params_obj.append("disabledRules", rule));
  }

  // Do NOT set enabledCategories / enabledRules here.
  // If older code added them, delete those defaults now:
  if (!form.has("enabledCategories")) params_obj.delete("enabledCategories");
  if (!form.has("enabledRules")) params_obj.delete("enabledRules");
  if (!form.has("disabledCategories")) params_obj.delete("disabledCategories");

  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params_obj,
  });

  const json = await upstream.json().catch(() => ({}));
  return NextResponse.json(json, { status: upstream.status });
}
