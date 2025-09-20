/**
 * POST /api/languagetool/v1/check
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/languagetool/v1/check \
 *     -H 'Content-Type: application/json' \
 *     -d '{"text":"I has an apple.","language":"en-US"}'
 */

import { NextResponse } from "next/server";

const DEFAULT_LT_BASE = "http://127.0.0.1:8010";
const REQUEST_TIMEOUT_MS = 20_000;

function normalizeBase(base: string): string {
  if (base.endsWith("/")) return base.slice(0, -1);
  return base;
}

function getLtBaseUrl(): string {
  return normalizeBase(process.env.LT_BASE_URL || DEFAULT_LT_BASE);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, {
    status: 400,
    headers: { "Cache-Control": "no-store" }
  });
}

async function requestLanguageTool(text: string, language: string) {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("language", language || "en-US");
  params.set("enabledOnly", "false");
  params.set("level", "picky");

  const apiKey = process.env.LANGUAGETOOL_API_KEY;
  if (apiKey) params.set("apiKey", apiKey);

  const url = `${getLtBaseUrl()}/v2/check`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    }, REQUEST_TIMEOUT_MS);

    if (!response.ok) return null;
    const json = await response.json().catch(() => null);
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return badRequest("Expected application/json body");
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return badRequest("Invalid JSON body");
    }

    const text = typeof body.text === "string" ? body.text : "";
    const language = typeof body.language === "string" && body.language.trim()
      ? body.language.trim()
      : "en-US";

    if (!text.trim()) {
      return badRequest("Field 'text' is required and must be a non-empty string");
    }

    const ltJson = await requestLanguageTool(text, language);
    if (!ltJson) {
      return NextResponse.json({ matches: [] }, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-LT-Fallback": "offline",
        },
      });
    }

    return NextResponse.json(ltJson, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    const message = typeof err?.message === "string" && err.message
      ? err.message
      : "Unexpected error";
    return NextResponse.json({ error: message }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
