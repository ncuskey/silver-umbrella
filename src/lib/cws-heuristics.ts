// src/lib/cws-heuristics.ts
import type { Token } from "@/lib/spell/types";

export interface VirtualTerminalInsertion {
  /** boundary index BEFORE which we insert the terminal (between tokens[bIndex] and tokens[bIndex+1]) */
  beforeBIndex: number;
  /** UI text */
  message: string;
  /** which char to show/score as the terminal */
  char: "." | "!" | "?";
}

const isWord = (t?: Token) => t?.type === "WORD";
const startsCap = (t?: Token) => !!t?.raw && /^[A-Z]/.test(t.raw);
const titleLike = (a?: Token, b?: Token) =>
  isWord(a) && isWord(b) && /^[A-Z]/.test(a!.raw) && /^[A-Z]/.test(b!.raw);

/** Words that commonly start a new sentence; helps reduce false positives */
const SENTENCE_STARTERS = new Set([
  "I", "Then", "When", "After", "Before", "So", "But", "And", "However", "Therefore",
]);

/**
 * Detect boundaries where a sentence likely ended but the writer omitted . ! or ?
 * Heuristics:
 *  - boundary is WORD -> WORD
 *  - right word starts with capital
 *  - there is no terminal punctuation (. ! ?) in the separator
 *  - either there is a hard break (newline or 2+ spaces) OR right word looks like a sentence starter
 *  - avoid flag when the next two words look like a Title Case span (e.g., "The Terrible Day")
 */
export function detectMissingTerminalInsertions(text: string, tokens: Token[]): VirtualTerminalInsertion[] {
  const ins: VirtualTerminalInsertion[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const L = tokens[i], R = tokens[i + 1];
    if (!isWord(L) || !isWord(R)) continue;

    const sep = text.slice((L as any).end ?? 0, (R as any).start ?? 0);
    const hasTerminal = /[.!?]/.test(sep);
    if (hasTerminal) continue;

    if (!startsCap(R)) continue;

    const hardBreak = /\r|\n/.test(sep) || /\s{2,}/.test(sep);
    const isStarter = SENTENCE_STARTERS.has(R.raw);

    // If it looks like a Title Case run (Two caps in a row), don't flag unless there's a hard break.
    const next = tokens[i + 2];
    const looksLikeTitle = titleLike(R, next);

    if ((hardBreak || isStarter) && !looksLikeTitle) {
      ins.push({
        beforeBIndex: i,
        message: "Possible missing sentence-ending punctuation before a capitalized word.",
        char: ".",
      });
    }
  }
  return ins;
}
