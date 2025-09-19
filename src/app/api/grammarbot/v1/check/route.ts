import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

type FixerEdit = { offset: number; length: number; replacement: string };
type NormalizedEdit = { start: number; end: number; replace: string };
type LlmDecision = { index: number; keep: boolean; reason?: string };
type LlmVerdict = { status: "ok" | "skipped" | "error"; decisions?: LlmDecision[]; error?: string };

const DEFAULT_FIXER_URL = "http://fixer:8085/fix";
const DEFAULT_LLAMA_ENDPOINT = "http://ollama:11434";
const DEFAULT_LLAMA_MODEL = "llama3.1:8b";

function normalizeFixerUrl(u: string | undefined): string | undefined {
  if (!u) return u;
  try {
    const url = new URL(u);
    if (url.hostname === "fixer") url.hostname = "127.0.0.1";
    return url.toString();
  } catch {
    // simple fallback rewrite
    return u.replace("http://fixer:", "http://127.0.0.1:");
  }
}

function alternateFixerUrl(u: string | undefined): string | undefined {
  if (!u) return u;
  try {
    const url = new URL(u);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      url.hostname = "fixer";
      return url.toString();
    }
    if (url.hostname === "fixer") {
      url.hostname = "127.0.0.1";
      return url.toString();
    }
  } catch {}
  return undefined;
}

function describeEdit(text: string, edit: FixerEdit, index: number) {
  const start = Math.max(0, Math.min(edit.offset ?? 0, text.length));
  const end = Math.max(start, Math.min((edit.offset ?? 0) + (edit.length ?? 0), text.length));
  return {
    index,
    start,
    end,
    replacement: edit.replacement ?? "",
    original: text.slice(start, end)
  };
}

async function sanityCheckWithLlama(text: string, edits: FixerEdit[]): Promise<LlmVerdict> {
  if (!edits?.length) return { status: "skipped" };

  const disabled = process.env.LLAMA_SANITY_DISABLED === "1" || process.env.LLAMA_SANITY_CHECK === "false";
  if (disabled) return { status: "skipped" };

  const endpoint = process.env.LLAMA_URL || process.env.OLLAMA_ENDPOINT || DEFAULT_LLAMA_ENDPOINT;
  const model = process.env.LLAMA_MODEL || DEFAULT_LLAMA_MODEL;

  const url = new URL(endpoint);
  if (!url.pathname || url.pathname === "/") url.pathname = "/api/chat";

  const payload = {
    model,
    messages: [
      {
        role: "system",
        content: "You double-check grammar suggestions from LanguageTool. Reply with strict JSON: {\"decisions\":[{\"index\":number,\"keep\":boolean,\"reason\":string}]} without extra text."
      },
      {
        role: "user",
        content: JSON.stringify({
          context: text,
          edits: edits.slice(0, 10).map((edit, idx) => describeEdit(text, edit, idx))
        })
      }
    ],
    format: "json",
    stream: false
  } as const;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { status: "error", error: `llama_http_${res.status}: ${body.slice(0, 200)}` };
    }

    const json = await res.json();
    const raw = json?.message?.content ?? json?.response ?? "";
    if (!raw) return { status: "error", error: "llama_empty" };

    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e: any) {
      return { status: "error", error: `llama_parse: ${String(e?.message || e)}` };
    }

    const list = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
    const decisions: LlmDecision[] = list
      .map((entry: any) => ({
        index: Number(entry?.index ?? 0),
        keep: !!entry?.keep,
        reason: typeof entry?.reason === "string" ? entry.reason : undefined
      }))
      .filter((d) => Number.isFinite(d.index));

    return { status: "ok", decisions };
  } catch (err: any) {
    return { status: "error", error: `llama_fetch: ${String(err?.message || err)}` };
  }
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    let text = "";
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({} as any));
      text = body?.text || body?.s || body?.q || "";
    } else {
      const form = await req.formData();
      text = (form.get("text") || form.get("s") || form.get("q") || "") as string;
    }
    if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

    const rawFixer = process.env.FIXER_URL || DEFAULT_FIXER_URL;
    const fixerUrl = normalizeFixerUrl(rawFixer);
    if (!fixerUrl) return NextResponse.json({ error: "FIXER_URL not set" }, { status: 500 });

    let fixerResponse: Response | null = null;
    let fixerErr: any = null;
    try {
      fixerResponse = await fetch(fixerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ text }),
        redirect: "error",
      });
    } catch (err) {
      fixerErr = err;
      fixerResponse = null;
    }

    if (!fixerResponse) {
      const alt = alternateFixerUrl(fixerUrl);
      if (alt) {
        try {
          fixerResponse = await fetch(alt, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ text }),
            redirect: "error",
          });
        } catch (err) {
          fixerErr = err;
        }
      }
    }

    if (!fixerResponse) {
      throw fixerErr || new Error("Fixer unavailable");
    }

    if (!fixerResponse.ok) {
      const body = await fixerResponse.text().catch(() => "");
      return NextResponse.json({ error: "Fixer error", status: fixerResponse.status, body, fixerUrl }, { status: 502 });
    }

    const data = (await fixerResponse.json()) as { input: string; fixed: string; edits: FixerEdit[] };

    const normEdits: NormalizedEdit[] = (data.edits || [])
      .map(e => {
        const start = Math.max(0, Math.min(e.offset ?? 0, text.length));
        const end = Math.max(start, Math.min((e.offset ?? 0) + (e.length ?? 0), text.length));
        return { start, end, replace: e.replacement ?? "" };
      })
      .sort((a, b) => a.start - b.start);

    const llamaVerdict = await sanityCheckWithLlama(text, data.edits || []);

    return NextResponse.json({
      input: data.input ?? text,
      fixed: data.fixed ?? text,
      edits: normEdits,
      llamaVerdict,
    });
  } catch (e: any) {
    const cause: any = e?.cause ?? {};
    return NextResponse.json({
      error: String(e?.message || e),
      code: cause?.code,
      errno: cause?.errno,
      syscall: cause?.syscall,
      hostname: cause?.hostname
    }, { status: 500 });
  }
}
