// src/lib/cws.ts
import type { Token } from "@/lib/spell/types";

/** Which punctuation participates in CWS (commas are excluded per CBM). */
export const ESSENTIAL_PUNCT = new Set([".", "!", "?", ":", ";"]);

/** Helpers */
export const isWord = (t: Token) => t.type === "WORD";
export const isPunct = (t: Token) => t.type === "PUNCT";
export const isEssentialPunct = (t: Token) => isPunct(t) && ESSENTIAL_PUNCT.has(t.raw);

/** A boundary (caret) between writing units. index = -1 is the initial boundary before the first unit. */
export interface CwsPair {
  /** boundary index relative to the *full token list*: -1 is initial, otherwise i means between tokens[i] and tokens[i+1] */
  bIndex: number;
  /** indexes into the original tokens array for the left/right unit (null = start-of-sample) */
  leftTok: number | null;
  rightTok: number | null;
  /** whether this boundary is eligible to be counted for CWS */
  eligible: boolean;
  /** rule-based validity (before overrides) */
  valid: boolean;
  /** machine-readable reason when invalid (for tooling) */
  reason?: "misspelling" | "capitalization" | "nonessential-punct" | "not-units";
  /** whether this boundary involves a virtual terminal insertion */
  virtualBoundary?: boolean;
}

/**
 * Build CBM CWS pairs from tokens.
 * Rules:
 *  - Count boundaries only between WORDs and ESSENTIAL punctuation (., !, ?, :, ;)
 *  - Ignore commas and other non-essential marks entirely (they neither help nor hurt)
 *  - WORD↔WORD: both words must be spelled correctly
 *  - WORD→TERM(.!?:;) : the word must be spelled correctly
 *  - TERM(.!?:;)→WORD : the next word must begin with a capital letter AND be spelled correctly
 *  - Initial boundary (^First) counts when the first WORD is spelled correctly and capitalized
 */
export function buildCwsPairs(
  tokens: Token[],
  isCorrectSpelling: (word: string) => boolean
): CwsPair[] {
  // Identify "writing units" (WORD or ESSENTIAL PUNCT)
  const unitIdxs: number[] = [];
  tokens.forEach((t, i) => {
    if (isWord(t) || isEssentialPunct(t)) unitIdxs.push(i);
  });

  const pairs: CwsPair[] = [];

  // Initial boundary before the first unit
  if (unitIdxs.length) {
    const first = tokens[unitIdxs[0]];
    const eligible = isWord(first);
    let valid = false;
    let reason: CwsPair["reason"] | undefined = undefined;

    if (eligible) {
      const spelled = isCorrectSpelling(first.raw);
      const capital = /^[A-Z]/.test(first.raw);
      valid = spelled && capital;
      if (!valid) reason = capital ? "misspelling" : "capitalization";
    } else {
      reason = "not-units";
    }

    pairs.push({
      bIndex: -1,
      leftTok: null,
      rightTok: unitIdxs[0],
      eligible,
      valid,
      reason,
    });
  }

  // Interior boundaries between successive units
  for (let ui = 0; ui < unitIdxs.length - 1; ui++) {
    const li = unitIdxs[ui];
    const ri = unitIdxs[ui + 1];
    const L = tokens[li];
    const R = tokens[ri];

    let eligible = true;
    let valid = true;
    let reason: CwsPair["reason"] | undefined = undefined;

    // WORD ↔ WORD
    if (isWord(L) && isWord(R)) {
      const okL = isCorrectSpelling(L.raw);
      const okR = isCorrectSpelling(R.raw);
      valid = okL && okR;
      if (!valid) reason = "misspelling";
    }
    // WORD → TERM (.!?:;)
    else if (isWord(L) && isEssentialPunct(R)) {
      const okL = isCorrectSpelling(L.raw);
      valid = okL; // terminal mark itself is "correct" by definition
      if (!valid) reason = "misspelling";
    }
    // TERM (.!?:;) → WORD
    else if (isEssentialPunct(L) && isWord(R)) {
      const okR = isCorrectSpelling(R.raw);
      const cap = /^[A-Z]/.test(R.raw);
      valid = okR && cap;
      if (!valid) reason = cap ? "misspelling" : "capitalization";
    }
    // Anything involving non-essential punctuation is *not eligible* (commas, quotes, hyphens, etc.)
    else {
      eligible = false;
      valid = false;
      reason = "nonessential-punct";
    }

    pairs.push({
      bIndex: li, // boundary is between tokens[li] and tokens[li+1] in full token stream
      leftTok: li,
      rightTok: ri,
      eligible,
      valid,
      reason,
      virtualBoundary: (tokens[li] as any).virtual || (tokens[ri] as any).virtual,
    });
  }

  return pairs;
}
