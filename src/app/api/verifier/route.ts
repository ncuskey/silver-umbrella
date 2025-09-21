/**
 * POST /api/verifier
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/verifier \
 *     -H 'Content-Type: application/json' \
 *     -d '{"text":"Sample writing.","mode":"quick"}'
 */

import { NextResponse } from "next/server";

type AuditMatch = {
  id?: string;
  start: number;
  end: number;
  label?: string;
  message?: string;
  replace?: string;
};

type AuditBody = {
  mode: "audit";
  text: string;
  lt?: { matches?: AuditMatch[] };
  limits?: { max_missed?: number };
};

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

function auditOfflineResponse() {
  return NextResponse.json(
    { lt_review: [], missed: [], offline: true },
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

  const modeRaw = typeof body.mode === "string" ? body.mode.toLowerCase() : "quick";
  if (modeRaw === "audit") {
    return handleAuditMode(body as AuditBody);
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return invalid("Field 'text' is required and must be a non-empty string");
  }

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

function normalizeAuditMatches(matches: unknown): AuditMatch[] {
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const startValue = (item as any).start;
      const endValue = (item as any).end;
      const start = typeof startValue === "number" ? startValue : Number(startValue);
      const end = typeof endValue === "number" ? endValue : Number(endValue);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return null;
      }
      if (start < 0 || end < start) {
        return null;
      }
      const id = (item as any).id;
      const label = (item as any).label;
      const message = (item as any).message;
      const replace = (item as any).replace;
      return {
        id: typeof id === "string" ? id : undefined,
        start,
        end,
        label: typeof label === "string" ? label : undefined,
        message: typeof message === "string" ? message : undefined,
        replace: typeof replace === "string" ? replace : undefined
      } as AuditMatch;
    })
    .filter((entry): entry is AuditMatch => Boolean(entry));
}

function clampMaxMissed(value: unknown) {
  const raw = typeof value === "number" ? value : Number(value ?? Number.NaN);
  if (!Number.isFinite(raw)) {
    return 10;
  }
  if (raw < 0) {
    return 0;
  }
  if (raw > 20) {
    return 20;
  }
  return Math.floor(raw);
}

function isLocalUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(\/|$)/i.test(url);
}

function buildAuditUserMessage(text: string, matches: AuditMatch[], maxMissed: number) {
  const items = matches.map((m) => {
    const message = (m.message || "").replace(/\n/g, " ");
    const replace = (m.replace || "").replace(/\n/g, " ");
    const label = m.label || "";
    const id = m.id || "";
    return `- id=${id} start=${m.start} end=${m.end} label="${label}" msg="${message}" rep="${replace}"`;
  });

  return [
    "Mode: audit",
    `Max missed issues: ${maxMissed}`,
    "",
    "TEXT:",
    text,
    "",
    "LT_MATCHES:",
    ...items,
    "",
    "Respond with a STRICT JSON object that matches exactly:",
    "{",
    `  "lt_review": [`,
    `    { "id": "m1", "decision": "CORRECT"|"INCORRECT", "reason": "≤12 words", "suggestion": "≤4 words or """ }`,
    "  ],",
    `  "missed": [`,
    `    { "start": 0, "end": 0, "label": "SPELL"|"GRAMMAR"|"PUNC"|"STYLE"|"CASING"|"OTHER", "reason": "≤12 words", "suggestion": "≤4 words or """ }`,
    "  ]",
    "}"
  ].join("\n");
}

async function handleAuditMode(body: AuditBody) {
  if (typeof body.text !== "string") {
    return invalid("Field 'text' is required and must be a string");
  }

  const text = body.text;
  const matches = normalizeAuditMatches(body.lt?.matches);
  const maxMissed = clampMaxMissed(body.limits?.max_missed ?? 10);

  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const auditModel = process.env.LLM_MODEL ?? "phi3:mini";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const externalCallsDisabled = process.env.EXTERNAL_CALLS_DISABLED === "1";
  const baseIsLocal = isLocalUrl(baseUrl);

  if (externalCallsDisabled && !baseIsLocal) {
    return auditOfflineResponse();
  }
  if (!baseIsLocal) {
    return auditOfflineResponse();
  }

  const isOllama = /(^|:\/\/)127\.0\.0\.1:11434(\/|$)/.test(process.env.LLM_BASE_URL ?? "");

  const endpoint = `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS
  );

  const systemPrompt = "You adjudicate grammar/style checks for en-US. Output ONLY strict JSON. No code fences. Character offsets are 0-based half-open [start,end). Suggestions <= 4 words or empty string.";

  const userMessage = buildAuditUserMessage(text, matches, maxMissed);

  try {
    const payload: Record<string, unknown> = {
      model: auditModel,
      temperature: 0,
      top_p: 0,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    };

    if (isOllama) {
      payload.format = "json";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return auditOfflineResponse();
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return auditOfflineResponse();
    }

    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!raw) {
      return auditOfflineResponse();
    }

    const jsonStr = extractFirstJsonObject(raw);
    if (!jsonStr) {
      return auditOfflineResponse();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return auditOfflineResponse();
    }

    const ltReview = Array.isArray(parsed.lt_review) ? parsed.lt_review : [];
    const missed = Array.isArray(parsed.missed) ? parsed.missed : [];

    return NextResponse.json(
      { lt_review: ltReview, missed },
      { status: 200, headers: baseHeaders() }
    );
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return auditOfflineResponse();
    }
    return auditOfflineResponse();
  } finally {
    clearTimeout(timer);
  }
}
function extractFirstJsonObject(value: string): string | null {
  let s = value.replace(/```[\s\S]*?\n/g, "").replace(/```/g, "");
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

