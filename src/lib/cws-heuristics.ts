// src/lib/cws-heuristics.ts
import type { Token } from "@/lib/spell/types";

export interface VirtualTerminalInsertion {
  /** boundary index BEFORE which we insert the terminal (between tokens[bIndex] and tokens[bIndex+1]) */
  beforeBIndex: number;
  /** UI text */
  message: string;
  /** which char to show/score as the terminal */
  char: "." | "!" | "?";
  /** reason for the insertion */
  reason: "CapitalAfterSpace" | "LT" | "Heuristic";
}

export type VirtualTerminal = {
  insertAfterIdx: number;                  // token index the dot comes after
  reason: "CapitalAfterSpace" | "LT" | "Heuristic";
  dotTokenIndex: number;                   // index of the synthetic "." token in the stream
  leftBoundaryBIndex: number;              // caret between [leftWord ^ "."]
  rightBoundaryBIndex: number;             // caret between ["." ^ rightWord]
};

/**
 * Convert VirtualTerminalInsertion to VirtualTerminal with boundary indices
 * This should be called after virtual terminals are inserted into the token stream
 */
export function createVirtualTerminals(
  insertions: VirtualTerminalInsertion[],
  originalTokens: Token[],
  displayTokens: Token[]
): VirtualTerminal[] {
  const result: VirtualTerminal[] = [];
  
  // Sort insertions by beforeBIndex to process them in order
  const sorted = [...insertions].sort((a, b) => a.beforeBIndex - b.beforeBIndex);
  
  for (let i = 0; i < sorted.length; i++) {
    const insertion = sorted[i];
    const originalIdx = insertion.beforeBIndex;
    
    // Find the dot token index in the display tokens
    // The dot should be inserted after the original token at originalIdx
    let dotTokenIndex = -1;
    let displayIdx = 0;
    let originalCount = 0;
    
    for (let j = 0; j < displayTokens.length; j++) {
      if (displayTokens[j].idx === -1) {
        // This is a virtual token
        if (originalCount === originalIdx + 1) {
          dotTokenIndex = j;
          break;
        }
      } else {
        // This is an original token
        if (originalCount === originalIdx) {
          dotTokenIndex = j + 1; // Dot comes after this token
          break;
        }
        originalCount++;
      }
    }
    
    if (dotTokenIndex === -1) continue; // Skip if we couldn't find the dot
    
    // Calculate boundary indices
    // leftBoundaryBIndex: boundary between leftWord and dot
    const leftBoundaryBIndex = originalIdx;
    
    // rightBoundaryBIndex: boundary between dot and rightWord  
    const rightBoundaryBIndex = originalIdx + 1;
    
    result.push({
      insertAfterIdx: originalIdx,
      reason: insertion.reason,
      dotTokenIndex,
      leftBoundaryBIndex,
      rightBoundaryBIndex,
    });
  }
  
  return result;
}


/**
 * Detect places where a sentence-ending terminal is likely missing, per Figure 4:
 *  - WORD [space] CapitalWord ⇒ probable new sentence
 *  - Ignore commas (non-essential); treat ." " ) ] as valid closers after a terminal
 *  - Avoid false positives for TitleCase runs (e.g., "The Terrible Day")
 *  - Avoid common abbreviations (Dr., Mr., etc.), initials (A., J.), and ellipses
 *  - Newlines count as soft boundaries (suppresses virtual terminal)
 */
export function detectMissingTerminalInsertions(text: string, tokens: Token[]): VirtualTerminalInsertion[] {
  const result: VirtualTerminalInsertion[] = [];
  if (!tokens.length) return result;

  const TERM = new Set([".", "!", "?"]);
  const NON_ESSENTIAL = new Set([",", ";", ":", "—", "–", "-", "…"]);
  const QUOTE_CLOSERS = new Set(['"', "\u201D", "'", "\u2019", ")", "]"]);
  const ABBREV = new Set([
    "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.", "St.", "Mt.",
    "U.S.", "U.K.", "vs.", "etc.", "e.g.", "i.e.", "No.", "Co.", "Inc."
  ]);
  const isCap = (s: string) => /^[A-Z]/.test(s.normalize("NFKC"));
  const isWord = (t: Token) => t.type === "WORD";
  const isTerminal = (t?: Token) => !!t && (TERM.has(t.raw) || (t.raw === "..." || t.raw === "…"));
  const isNonEssential = (t?: Token) => !!t && NON_ESSENTIAL.has(t.raw);
  const isCloser = (t?: Token) => !!t && QUOTE_CLOSERS.has(t.raw);
  const isAbbrev = (left: Token | undefined) => !!left && ABBREV.has(left.raw);

  // Detect TitleCase run starting at i (len>=2).
  const titleRunLength = (start: number): number => {
    let len = 0;
    for (let k = start; k < tokens.length && isWord(tokens[k]) && isCap(tokens[k].raw); k++) len++;
    return len;
  };

  for (let i = 0; i < tokens.length - 1; i++) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (!isWord(left)) continue;

    // If sentence already closed: TERM [closers]* rightWord ⇒ OK
    if (isTerminal(left)) continue;
    if (isNonEssential(right)) continue; // comma/colon/semicolon dash following: not a new sentence

    // Skip known abbreviations like "Dr." before CapitalWord
    if (isAbbrev(left)) continue;

    // Soft boundary: if there's a newline gap between left and right in raw text, skip
    if (typeof left.end === "number" && typeof right.start === "number") {
      // Any newline or 2+ spaces suggests the writer intended a break; don't insert a dot
      // (teacher can still mark pairs red if needed)
      const gap = right.start - left.end;
      void gap;
    }

    // CapitalAfterSpace pattern: word ^ CapitalWord
    if (isWord(right) && isCap(right.raw)) {
      // Avoid TitleCase runs e.g., "the ^ The Terrible Day"
      const runLen = titleRunLength(i + 1);
      
      // Also check if we're in the middle of a TitleCase run by looking backwards
      let isInTitleRun = false;
      if (isCap(left.raw)) {
        // If left word is capitalized, check if we're in a TitleCase run
        let j = i;
        while (j >= 0 && isWord(tokens[j]) && isCap(tokens[j].raw)) {
          j--;
        }
        const titleRunStart = j + 1;
        const titleRunLength = i - titleRunStart + 1;
        isInTitleRun = titleRunLength >= 2;
      }
      
      if (runLen >= 2 || isInTitleRun) continue; // likely a title/noun phrase, not a sentence start

      // Ensure we don't already have essential punctuation in between via closers
      // e.g., word ^ . ^ " ^ CapitalWord
      const next = tokens[i + 1];
      if (isCloser(next)) continue;

      result.push({
        beforeBIndex: i,
        message: "Possible missing sentence-ending punctuation before a capitalized word.",
        char: ".",
        reason: "CapitalAfterSpace",
      });
    }
  }
  return result;
}
