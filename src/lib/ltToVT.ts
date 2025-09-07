import type { LtIssue, Token, VirtualTerminalInsertion } from "./types";
import { ltRuleId, ltOffset, ltMarked } from "./ltFilter";

const SENT_TERMS = new Set([".", "!", "?"]);
const OPENERS = new Set(['"', '"', "'", "(", "[", "{", "«"]);
const CLOSERS = new Set(['"', '"', "'", ")", "]", "}", "»"]);

const isWord = (t: Token) => /\w/.test(t.raw?.[0] ?? "");

function tokenAtOffset(tokens: Token[], offset: number) {
  for (const t of tokens) if (offset >= t.start && offset < t.end) return t;
  return undefined;
}
function firstWordAfter(tokens: Token[], offset: number) {
  const j = tokens.findIndex(t => t.start >= offset && isWord(t));
  return j >= 0 ? tokens[j] : undefined;
}
function findByRaw(tokens: Token[], raw?: string) {
  if (!raw) return undefined;
  const j = tokens.findIndex(t => t.raw === raw);
  return j >= 0 ? tokens[j] : undefined;
}
function prevWordIndex(tokens: Token[], j: number) {
  for (let k = j - 1; k >= 0; k--) if (isWord(tokens[k])) return k;
  return -1;
}
function nearestBoundaryLeftOf(tokens: Token[], j: number) {
  for (let k = j - 1; k >= 0; k--) {
    const tk = tokens[k];
    if (tk.raw === "^" || tk.type === "BOUNDARY" || tk.type === "BND") return k;
  }
  return -1;
}

function locateStartToken(text: string, tokens: Token[], issue: LtIssue) {
  const off = ltOffset(issue);
  let t = off >= 0 ? tokenAtOffset(tokens, off) : undefined;
  if (!t && off >= 0) t = firstWordAfter(tokens, off);
  if (!t) t = findByRaw(tokens, ltMarked(issue, text));
  return t;
}

export function ltIssuesToInsertions(
  text: string,
  tokens: Token[],
  issues: LtIssue[]
): VirtualTerminalInsertion[] {
  const out: VirtualTerminalInsertion[] = [];
  const seen = new Set<number>(); // by boundary index

  for (const issue of issues) {
    const id = ltRuleId(issue);

    if (id === "UPPERCASE_SENTENCE_START") {
      const startTok = locateStartToken(text, tokens, issue);
      if (!startTok) continue;

      const wordIdx = prevWordIndex(tokens, startTok.idx);
      const boundaryIdx = nearestBoundaryLeftOf(tokens, startTok.idx);
      if (wordIdx < 0 || boundaryIdx < 0) continue;

      const prevRaw = tokens[wordIdx].raw;
      if (OPENERS.has(startTok.raw) || CLOSERS.has(prevRaw) || SENT_TERMS.has(prevRaw)) continue;
      if (seen.has(boundaryIdx)) continue;

      out.push({ at: tokens[wordIdx].end, char: ".", beforeBIndex: boundaryIdx, reason: "LT" });
      seen.add(boundaryIdx);
      continue;
    }

    if (id === "MISSING_SENTENCE_TERMINATOR" || id === "PUNCTUATION_PARAGRAPH_END") {
      // treat like "insert before next sentence start":
      const startTok = locateStartToken(text, tokens, issue) ?? tokens.at(-1);
      if (!startTok) continue;

      const wordIdx = prevWordIndex(tokens, startTok.idx + 1);
      const boundaryIdx = nearestBoundaryLeftOf(tokens, startTok.idx + 1);
      const beforeIdx = boundaryIdx >= 0 ? boundaryIdx : wordIdx;

      if (wordIdx < 0 || beforeIdx < 0) continue;
      if (SENT_TERMS.has(tokens[wordIdx].raw)) continue;
      if (seen.has(beforeIdx)) continue;

      out.push({ at: tokens[wordIdx].end, char: ".", beforeBIndex: beforeIdx, reason: "LT" });
      seen.add(beforeIdx);
      continue;
    }
  }

  return out;
}
