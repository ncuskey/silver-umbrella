import type { Token, VirtualTerminalInsertion } from "./types";
import type { GbEdit } from "./gbClient";

const TERMS = [".","!","?"] as const;
const isWord = (t: Token) => /\w/.test(t.raw?.[0] ?? "");

function prevWordIndex(tokens: Token[], j: number) {
  for (let k = j - 1; k >= 0; k--) if (isWord(tokens[k])) return k;
  return -1;
}

function nearestBoundaryLeftOf(tokens: Token[], j: number) {
  for (let k = j - 1; k >= 0; k--) {
    const tk = tokens[k];
    if (tk.raw === "^" || tk.type === "BOUNDARY") return k;
  }
  return -1;
}

function termFromReplace(original: string, repl: string) {
  // direct punctuation insertion
  if (TERMS.includes(repl as any)) return repl as "." | "!" | "?";
  // replacement that *adds* terminal to end (e.g., "Day" → "Day.")
  const last = repl.at(-1);
  if (TERMS.includes(last as any) && !original.endsWith(last!)) return last as "." | "!" | "?";
  return undefined;
}

export function gbEditsToInsertions(
  text: string, 
  tokens: Token[], 
  edits: GbEdit[]
): VirtualTerminalInsertion[] {
  const out: VirtualTerminalInsertion[] = [];
  const seen = new Set<number>();

  for (const e of (edits ?? [])) {
    const original = text.slice(e.start, e.end);
    const term = termFromReplace(original, e.replace ?? "");
    if (!term) continue;             // only act on terminal punctuation proposals

    // tokens after the edit end → next sentence start region
    const nextIdx = tokens.findIndex(t => t.start >= e.end);
    const anchor = nextIdx >= 0 ? nextIdx : tokens.length;

    const wordIdx = prevWordIndex(tokens, anchor);
    const boundaryIdx = nearestBoundaryLeftOf(tokens, anchor);
    const beforeIdx = boundaryIdx >= 0 ? boundaryIdx : wordIdx;

    if (wordIdx < 0 || beforeIdx < 0) continue;
    if (seen.has(beforeIdx)) continue;

    out.push({ 
      at: tokens[wordIdx].end, 
      char: term, 
      beforeBIndex: beforeIdx, 
      reason: "GB" as any,
      message: e.err_desc || `Add ${term}`
    });
    seen.add(beforeIdx);

    if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
      console.info("[GB→VT] PUSH", { 
        term, 
        word: tokens[wordIdx].raw, 
        boundaryIdx: beforeIdx, 
        edit: e 
      });
    }
  }
  return out;
}
