import type { Token } from "@/lib/types";
import type { HeuristicsResult, HeuristicIssue, SentenceInfo } from "@/lib/cbmHeuristics";

export type NormalizedEdit = {
  start: number;
  end: number;
  replace: string;
  err_cat?: string;
  err_type?: string;
  err_desc?: string;
  edit_type?: string;
};

export interface LlamaFinding extends HeuristicIssue {
  source: "llama";
  sentenceIndex: number;
}

export interface LlamaVerifierOptions {
  url?: string;
  model?: string;
  disabled?: boolean;
  maxWindows?: number;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

interface VerifierWindow {
  sentence: SentenceInfo;
  tokenIndices: number[]; // global token indices covered by this window
  tokenSlice: Token[];
  reason: string;
  unknownTokenIndices: number[]; // local indices
  existingFindings: Array<{ rule: string; span: number[]; msg: string }>;
}

const DEFAULT_MODEL = "llama3.1:8b";
const DEFAULT_MAX_WINDOWS = 5;
const DEFAULT_MAX_TOKENS = 256;

const RUBRIC = `Contractions count as one word. Maintain subject-verb agreement. Narrative tense should stay consistent. Require space between words; no space before punctuation (. , ! ? ; :) but space after commas and periods unless immediately followed by closing quotes/parentheses. Oxford comma is optional.`;

function stripNewlines(input: string): string {
  return input.replace(/[\r\n]+/g, " ").trim();
}

function windowTokens(tokens: Token[], sentence: SentenceInfo): { slice: Token[]; indices: number[] } {
  const slice: Token[] = [];
  const indices: number[] = [];
  for (let i = sentence.startToken; i <= sentence.endToken; i += 1) {
    slice.push(tokens[i]);
    indices.push(i);
  }
  return { slice, indices };
}

function tokensToPrompt(tokens: Token[], indices: number[]): string {
  return tokens
    .map((t, idx) => {
      const safe = t.raw.replace(/"/g, '\\"');
      return `${idx}:"${safe}"`;
    })
    .join(" ");
}

function normalizeExistingFindings(
  tokens: Token[],
  globalIndices: number[],
  ltEdits: NormalizedEdit[],
  heuristics: HeuristicsResult,
): Array<{ rule: string; span: number[]; msg: string }> {
  const result: Array<{ rule: string; span: number[]; msg: string }> = [];

  const indexMap = new Map<number, number>();
  globalIndices.forEach((globalIdx, localIdx) => indexMap.set(globalIdx, localIdx));

  const pushFinding = (rule: string, span: number[], msg: string) => {
    if (span.length === 0) return;
    result.push({ rule, span, msg });
  };

  ltEdits.forEach(edit => {
    const span: number[] = [];
    globalIndices.forEach((globalIdx, localIdx) => {
      const token = tokens[globalIdx];
      if (!token) return;
      const start = token.start ?? 0;
      const end = token.end ?? 0;
      if (start >= edit.start && end <= edit.end) {
        span.push(localIdx);
      }
    });
    if (span.length) {
      pushFinding(edit.err_type || edit.err_cat || "LT_RULE", span, edit.err_desc || "LanguageTool finding");
    }
  });

  heuristics.wordIssues.concat(heuristics.boundaryIssues).forEach(issue => {
    if (!issue.tokenIndices?.length) return;
    const span: number[] = [];
    issue.tokenIndices.forEach(globalIdx => {
      const local = indexMap.get(globalIdx);
      if (typeof local === "number") span.push(local);
    });
    if (span.length) pushFinding(issue.rule, span, issue.message);
  });

  return result;
}

function selectWindows(
  text: string,
  tokens: Token[],
  heuristics: HeuristicsResult,
  ltEdits: NormalizedEdit[],
  options?: LlamaVerifierOptions
): VerifierWindow[] {
  const windows: VerifierWindow[] = [];
  const maxWindows = options?.maxWindows ?? DEFAULT_MAX_WINDOWS;

  heuristics.sentences.forEach(sentence => {
    if (windows.length >= maxWindows) return;
    const { slice, indices } = windowTokens(tokens, sentence);
    const unknownTokenIndices: number[] = [];

    heuristics.metadata.unknownWordIndices.forEach(idx => {
      const local = indices.indexOf(idx);
      if (local !== -1) unknownTokenIndices.push(local);
    });

    const ltCovers = new Set<number>();
    ltEdits.forEach(edit => {
      indices.forEach((globalIdx, localIdx) => {
        const token = tokens[globalIdx];
        if (!token) return;
        const start = token.start ?? 0;
        const end = token.end ?? 0;
        if (start >= edit.start && end <= edit.end) ltCovers.add(localIdx);
      });
    });

    const pureUnknown = unknownTokenIndices.filter(idx => !ltCovers.has(idx));
    const lacksTerminator = !sentence.hasTerminalPunctuation && sentence.reason !== "terminator";

    const trigger = pureUnknown.length >= 1 || lacksTerminator;
    if (!trigger) return;

    const existingFindings = normalizeExistingFindings(tokens, indices, ltEdits, heuristics);

    windows.push({
      sentence,
      tokenIndices: indices,
      tokenSlice: slice,
      reason: lacksTerminator ? "missing_terminal" : "unknown_word",
      unknownTokenIndices: pureUnknown,
      existingFindings,
    });
  });

  return windows;
}

async function callOllama(
  url: string,
  model: string,
  system: string,
  user: string,
  options?: LlamaVerifierOptions
): Promise<any> {
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: options?.temperature ?? 0,
    top_p: options?.topP ?? 1,
    max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: false,
    format: "json",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`llama_http_${response.status}: ${body.slice(0, 200)}`);
  }

  const json = await response.json();
  const raw = json?.message?.content ?? json?.response ?? "";
  if (!raw) throw new Error("llama_empty");

  if (typeof raw === "string") {
    return JSON.parse(raw);
  }
  return raw;
}

function mapMissedToIssues(
  missed: any[] | undefined,
  window: VerifierWindow,
  tokens: Token[],
): LlamaFinding[] {
  if (!Array.isArray(missed) || missed.length === 0) return [];
  const findings: LlamaFinding[] = [];

  missed.forEach((entry: any) => {
    const rule = typeof entry?.rule === "string" ? entry.rule : "LLAMA_RULE";
    const msg = typeof entry?.msg === "string" && entry.msg ? entry.msg : "LLM identified issue";
    const span = Array.isArray(entry?.span)
      ? entry.span
          .map((value: unknown) => Number(value))
          .filter((value: number): value is number => Number.isFinite(value))
      : [];

    const tokenIndices: number[] = [];
    span.forEach((localIdx: number) => {
      const global = window.tokenIndices[localIdx];
      if (typeof global === "number") tokenIndices.push(global);
    });

    const firstToken = tokens[tokenIndices[0]];
    const lastToken = tokens[tokenIndices[tokenIndices.length - 1]];

    findings.push({
      source: "llama",
      rule,
      severity: "warning",
      message: msg,
      tokenIndices,
      span: [
        firstToken?.start ?? window.sentence.startOffset,
        lastToken?.end ?? window.sentence.endOffset,
      ],
      sentenceIndex: window.sentence.index,
    });
  });

  return findings;
}

export async function runLlamaVerifier(
  text: string,
  tokens: Token[],
  heuristics: HeuristicsResult,
  ltEdits: NormalizedEdit[],
  options?: LlamaVerifierOptions
): Promise<LlamaFinding[]> {
  if (options?.disabled) return [];

  const baseUrl = options?.url || process.env.OLLAMA_URL || process.env.LLAMA_URL || "http://127.0.0.1:11434";
  const model = options?.model || process.env.LLAMA_MODEL || DEFAULT_MODEL;

  const url = new URL(baseUrl);
  if (!url.pathname || url.pathname === "/") url.pathname = "/api/chat";

  const windows = selectWindows(text, tokens, heuristics, ltEdits, options);
  if (windows.length === 0) return [];

  const results: LlamaFinding[] = [];

  for (const window of windows) {
    const promptTokens = tokensToPrompt(window.tokenSlice, window.tokenIndices);
    const existing = window.existingFindings;

    const payload = {
      Text: stripNewlines(text.slice(window.sentence.startOffset, window.sentence.endOffset)),
      Tokens: promptTokens,
      ExistingFindings: existing,
      Reason: window.reason,
      Rubric: RUBRIC,
    };

    const system = "You are a CBM/CWS verifier. Follow the rubric exactly. Only return JSON.";
    const user = JSON.stringify(payload);

    try {
      const json = await callOllama(url.toString(), model, system, user, options);
      const findings = mapMissedToIssues(json?.missed, window, tokens);
      results.push(...findings);
    } catch (err) {
      console.warn("[llama] verifier error", err);
      break; // stop on first failure to avoid spamming
    }
  }

  return results;
}
