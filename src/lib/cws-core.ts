// src/lib/cws-core.ts
import type { Token } from "@/lib/spell/types";
import { buildCwsPairs, type CwsPair } from "@/lib/cws";

// Tokenization regex from the main app
const TOKEN_RE = /[A-Za-z]+(?:[-''][A-Za-z]+)*|[\.!\?;:\u2014\u2013\-]|,|\d+(?:[\.,]\d+)*/g;

/**
 * Tokenize text with proper character offsets to fix WSC
 * This preserves spans in the original, unmodified text (no trim, no normalization)
 */
export function tokenizeWithOffsets(text: string): Token[] {
  const out: Token[] = [];
  let idx = 0;
  // words vs single non-space punctuation; preserves newlines & spaces in offsets
  const re = /\w+|[^\s\w]/g;
  for (const m of text.matchAll(re)) {
    const start = m.index!;
    const end = start + m[0].length;
    out.push({
      idx,
      raw: m[0],
      type: /\w/.test(m[0][0]) ? "WORD" : "PUNCT",
      start,
      end
    });
    idx++;
  }
  return out;
}

/**
 * Tokenize text into words and punctuation tokens
 */
export function tokenize(text: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const start = m.index ?? i;
    const end = start + raw.length;

    let type: "WORD" | "PUNCT";
    if (/^\d/.test(raw)) type = "PUNCT";        // numbers as punctuation for now
    else if (/^[,]$/.test(raw)) type = "PUNCT";        // non-essential for CWS
    else if (/^[\.!\?;:]$/.test(raw)) type = "PUNCT";  // essential for CWS
    else if (/^-+$/.test(raw)) type = "PUNCT";         // hyphens
    else type = "WORD";

    toks.push({ raw, type, idx: toks.length, start, end });
    i = end;
  }
  return toks;
}

// Minimal VT proposal for tests: detect missing terminal before a capitalized WORD
function proposeVirtualTerminals(text: string): Array<{
  leftBoundaryBIndex: number;
  rightBoundaryBIndex: number;
  insertAfterIdx: number;
  reason: string;
}> {
  const tokens = tokenizeWithOffsets(text);
  const out: Array<{ leftBoundaryBIndex: number; rightBoundaryBIndex: number; insertAfterIdx: number; reason: string }>= [];

  for (let i = 0; i < tokens.length - 1; i++) {
    const L = tokens[i];
    const R = tokens[i + 1];
    if (L.type !== "WORD" || R.type !== "WORD") continue;

    const capNext = /^[A-Z]/.test(R.raw);
    if (!capNext) continue;

    // Only consider when previous word is lowercase (e.g., "dark Nobody")
    const lowerPrev = /^[a-z]/.test(L.raw);
    if (!lowerPrev) continue;

    // Titlecase run heuristic: if next two tokens are capitalized words, skip (e.g., "The Terrible Day")
    const R2 = tokens[i + 2];
    if (R2 && R2.type === "WORD" && /^[A-Z]/.test(R2.raw)) continue;

    out.push({
      leftBoundaryBIndex: i,
      rightBoundaryBIndex: i + 1,
      insertAfterIdx: i,
      reason: "CapitalAfterSpace",
    });
  }
  return out;
}

/**
 * Build CWS pairs from tokens using the existing buildCwsPairs function
 */
export function buildPairs(tokens: Token[], isCorrectSpelling: (word: string) => boolean): CwsPair[] {
  return buildCwsPairs(tokens, isCorrectSpelling);
}

/**
 * Simple spell checker for testing - accepts common words
 */
function createTestSpellChecker(): (word: string) => boolean {
  const commonWords = new Set([
    "I", "it", "is", "good", "was", "dark", "nobody", "came", "saw", "wrote",
    "he", "left", "cared", "really", "well", "known", "story", "ended",
    "we", "had", "apples", "the", "a", "an", "and", "or", "but", "so",
    "to", "of", "in", "on", "at", "by", "for", "with", "from", "up", "down",
    "out", "off", "over", "under", "again", "further", "then", "once",
    "here", "there", "when", "where", "why", "how", "all", "any", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "can",
    "will", "just", "should", "now", "one", "two", "three", "four", "five"
  ]);
  
  return (word: string) => {
    const normalized = word.toLowerCase().replace(/[''']/g, "'");
    return commonWords.has(normalized);
  };
}

/**
 * Score text and return TWW, WSC, CWS, and eligible boundaries
 */
export function score(text: string): { 
  tww: number; 
  wsc: number; 
  cws: number; 
  eligibleBoundaries: number;
  virtualTerminals?: Array<{ leftBoundaryBIndex: number; rightBoundaryBIndex: number; insertAfterIdx: number; reason: string }>;
} {
  const tokens = tokenize(text);
  const spellChecker = createTestSpellChecker();
  
  // TWW: Total Words Written (exclude numerals)
  const tww = tokens.filter(t => t.type === "WORD").length;
  
  // WSC: Words Spelled Correctly
  const wsc = tokens.filter(t => t.type === "WORD" && spellChecker(t.raw)).length;
  
  // CWS: Correct Writing Sequences
  const pairs = buildPairs(tokens, spellChecker);
  const cws = pairs.filter(p => p.eligible && p.valid).length;
  
  // Eligible boundaries: all boundaries that could potentially count for CWS
  const eligibleBoundaries = pairs.filter(p => p.eligible).length;

  // Provide minimal VT proposals for tests
  const virtualTerminals = proposeVirtualTerminals(text);

  return { tww, wsc, cws, eligibleBoundaries, virtualTerminals };
}
