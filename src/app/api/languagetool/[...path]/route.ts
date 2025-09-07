import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies any path under /api/languagetool/* to the upstream LanguageTool service.
 * Example: POST /api/languagetool/v2/check -> https://api.languagetool.org/v2/check
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const form = await req.formData();
  const resolvedParams = await params;
  const subpath = (resolvedParams.path || []).join("/");
  const upstreamUrl = `https://api.languagetool.org/${subpath || "v2/check"}`;

  // Pass through ALL client params as-is
  const params_obj = new URLSearchParams();
  for (const [k, v] of form.entries()) params_obj.append(k, String(v));

  // Ensure we are NOT restricting categories/rules on the server
  // (Only honor them if the client explicitly sent them.)
  if (!params_obj.has("level")) params_obj.set("level", "default");      // or "picky" if you prefer
  if (!params_obj.has("enabledOnly")) params_obj.set("enabledOnly", "false");
  // Do NOT set enabledCategories / enabledRules here.
  // If older code added them, delete those defaults now:
  if (!form.has("enabledCategories")) params_obj.delete("enabledCategories");
  if (!form.has("enabledRules")) params_obj.delete("enabledRules");
  if (!form.has("disabledCategories")) params_obj.delete("disabledCategories");
  if (!form.has("disabledRules")) params_obj.delete("disabledRules");

  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params_obj,
  });

  const json = await upstream.json().catch(() => ({}));
  return NextResponse.json(json, { status: upstream.status });
}
