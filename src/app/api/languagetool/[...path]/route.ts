import { NextResponse } from "next/server";

/**
 * Proxies any path under /api/languagetool/* to the upstream LanguageTool service.
 * Example: POST /api/languagetool/v2/check -> https://api.languagetool.org/v2/check
 */
export async function POST(req: Request, { params }: { params: { path?: string[] } }) {
  const body = await req.text(); // x-www-form-urlencoded passthrough
  const subpath = (params.path || []).join("/");
  const upstreamUrl = `https://api.languagetool.org/${subpath || "v2/check"}`;

  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await upstream.json().catch(() => ({}));
  return NextResponse.json(json, { status: upstream.status });
}
