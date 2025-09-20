/**
 * POST /api/verifier
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/verifier \
 *     -H 'Content-Type: application/json' \
 *     -d '{"text":"Sample writing.","mode":"quick"}'
 */

import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "llama3.1:8b-instruct";
const DEFAULT_TIMEOUT_MS = 20_000;

function baseHeaders(extra?: HeadersInit) {
  return { "Cache-Control": "no-store", ...(extra || {}) };
}

function offlineResponse(reason = "offline") {
  return NextResponse.json(
    { verdict: "unknown", reason, offline: true },
    { status: 200, headers: baseHeaders() }
  );
}

function invalid(reason: string) {
  return NextResponse.json(
    { error: reason },
    { status: 400, headers: baseHeaders() }
  );
}

function buildPrompt(text: string, mode: "quick" | "strict") {
  const trimmed = text.trim();
  const bounded = trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}\n...[truncated]` : trimmed;
  return `Review the writing sample below and decide if it contains high-risk grammar or mechanical issues. Mode: ${mode}. Respond with JSON {"verdict":"approve|revise|reject|unknown","reason":"short explanation"}. Do not add extra text.\n\nText:\n<<<\n${bounded}\n>>>`;
}

async function callLocalLlm(text: string, mode: "quick" | "strict") {
  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

  try {
    const payload = {
      model,
      messages: [
        {
          role: "system",
          content: "You are a short, deterministic verifier. Respond ONLY with compact JSON."
        },
        {
          role: "user",
          content: buildPrompt(text, mode)
        }
      ],
      temperature: 0,
      max_tokens: 256
    } as const;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false as const, reason: `llm_http_${response.status}` };
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return { ok: false as const, reason: "llm_invalid_json" };
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false as const, reason: "llm_empty_content" };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = null;
    }

    const verdict = typeof parsed?.verdict === "string" ? parsed.verdict : "unknown";
    const reason = typeof parsed?.reason === "string" ? parsed.reason : content.trim();

    return {
      ok: true as const,
      data: {
        verdict,
        reason,
        raw: content
      }
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false as const, reason: "timeout" };
    }
    return { ok: false as const, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return invalid("Expected application/json body");
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return invalid("Invalid JSON body");
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return invalid("Field 'text' is required and must be a non-empty string");
  }

  const modeRaw = typeof body.mode === "string" ? body.mode.toLowerCase() : "quick";
  const mode = modeRaw === "strict" ? "strict" : "quick";

  const result = await callLocalLlm(text, mode);
  if (!result.ok) {
    const reason = result.reason;
    if (reason === "timeout" || reason === "network") {
      return offlineResponse("offline");
    }
    if (reason.startsWith("llm_http") || reason === "llm_invalid_json" || reason === "llm_empty_content") {
      return NextResponse.json(
        { verdict: "unknown", reason, offline: true },
        { status: 200, headers: baseHeaders() }
      );
    }
    return NextResponse.json(
      { verdict: "unknown", reason },
      { status: 200, headers: baseHeaders() }
    );
  }

  return NextResponse.json(result.data, { status: 200, headers: baseHeaders() });
}
