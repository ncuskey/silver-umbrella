// src/lib/cws-heuristics.ts
import type { Token } from "@/lib/spell/types";

export interface HeurHint { bIndex: number; message: string; kind: "terminal"; }

const isWord = (t: Token) => t.type === "WORD";
const cap = (w: string) => /^[A-Z]/.test(w);

export function buildTerminalHeuristics(text: string, tokens: Token[]): Map<number, HeurHint> {
  const map = new Map<number, HeurHint>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const L = tokens[i], R = tokens[i + 1];
    if (!isWord(L) || !isWord(R)) continue;
    if (!cap(R.raw)) continue;

    // separator text (between L and R)
    const sep = text.slice(L.end ?? 0, R.start ?? 0);

    // Heuristic gates to reduce false positives for proper nouns:
    // - separator contains a newline OR 2+ spaces (common when writers "hard break" sentences)
    // - OR R is one of common sentence starters (Then, When, After, So, But, And, I)
    const isHardBreak = /\r|\n/.test(sep) || /\s{2,}/.test(sep);
    const starters = /^(Then|When|After|Before|So|But|And|I)$/;
    const looksLikeSentenceStart = starters.test(R.raw);

    if (isHardBreak || looksLikeSentenceStart) {
      map.set(i, {
        bIndex: i,
        message: "Possible missing sentence-ending punctuation before a capitalized word.",
        kind: "terminal"
      });
    }
  }
  return map;
}
