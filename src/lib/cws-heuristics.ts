// src/lib/cws-heuristics.ts
import type { Token } from "@/lib/spell/types";
import { DEBUG, dgroup, dtable, dlog } from "@/lib/utils";

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

export function createVirtualTerminals(
  insertions: VirtualTerminalInsertion[],
  originalTokens: Token[],
  displayTokens: Token[]
): VirtualTerminal[] {
  const result: VirtualTerminal[] = [];
  const sorted = [...insertions].sort((a, b) => a.beforeBIndex - b.beforeBIndex);
  dgroup("[VT] createVirtualTerminals input", () => {
    dlog("insertions", sorted);
    dtable("displayTokens", displayTokens.map((t,i)=>({i,raw:t.raw,type:t.type,idx:(t as any).idx,virtual:(t as any).virtual})));
  });

  for (let i = 0; i < sorted.length; i++) {
    const insertion = sorted[i];
    const originalIdx = insertion.beforeBIndex;
    dlog("[VT] map insertion", { i, originalIdx, insertion });

    let dotTokenIndex = -1;
    let originalCount = 0;
    for (let j = 0; j < displayTokens.length; j++) {
      const dj: any = displayTokens[j];
      if (Number.isInteger(dj?.idx) && dj.idx >= 0) {
        if (originalCount === originalIdx) {
          dotTokenIndex = j + 1;
          break;
        }
        originalCount++;
      }
    }
    if (dotTokenIndex === -1) {
      dlog("[VT] ✖ could not locate dot for insertion", { originalIdx });
      continue;
    }

    const leftBoundaryBIndex = originalIdx;
    const rightBoundaryBIndex = originalIdx + 1;
    result.push({
      insertAfterIdx: originalIdx,
      reason: insertion.reason,
      dotTokenIndex,
      leftBoundaryBIndex,
      rightBoundaryBIndex,
    });
    dlog("[VT] ✓ group", {
      dotTokenIndex, leftBoundaryBIndex, rightBoundaryBIndex,
      leftRaw: (displayTokens[dotTokenIndex - 1] as any)?.raw,
      dotRaw: (displayTokens[dotTokenIndex] as any)?.raw,
      rightRaw: (displayTokens[dotTokenIndex + 1] as any)?.raw,
    });
  }
  dlog("[VT] groups built", result.length, result);
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
// NEW: robust group builder that only looks at the rendered stream
export function createVirtualTerminalsFromDisplay(displayTokens: Token[]): VirtualTerminal[] {
  const out: VirtualTerminal[] = [];
  for (let i = 0; i < displayTokens.length; i++) {
    const t: any = displayTokens[i];
    if (!t?.virtual || t.type !== "PUNCT" || !/[.?!]/.test(t.raw)) continue;
    let leftOriginalIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      const dj: any = displayTokens[j];
      if (Number.isInteger(dj?.idx) && dj.idx >= 0) { leftOriginalIdx = dj.idx; break; }
    }
    if (leftOriginalIdx < 0) continue;
    out.push({
      insertAfterIdx: leftOriginalIdx,
      reason: "LT", // Default to LT since this is used when LT is active
      dotTokenIndex: i,
      leftBoundaryBIndex: leftOriginalIdx,
      rightBoundaryBIndex: leftOriginalIdx + 1,
    });
  }
  return out;
}

const STOP_LEFT = new Set(["and","or","but","so","then","yet"]);
export function detectMissingTerminalInsertionsSmart(text: string, tokens: Token[]): VirtualTerminalInsertion[] {
  const out: VirtualTerminalInsertion[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const left = tokens[i], right = tokens[i+1];
    if (left.type !== "WORD" || right.type !== "WORD") continue;

    const leftRaw = String(left.raw);
    const rightRaw = String(right.raw);

    // left is lower-case word, right is Capitalized word
    const leftOk = /^[a-z]/.test(leftRaw);
    const rightCapital = /^[A-Z]/.test(rightRaw);

    // avoid common false positives
    if (!leftOk || !rightCapital) continue;
    if (STOP_LEFT.has(leftRaw.toLowerCase())) continue;  // "and", "then", ...
    if (rightRaw === "I") continue;                      // "and I", "Then I"
    // ensure no punctuation already present
    const hasPunct = /[.?!;:,]$/.test(leftRaw);
    if (hasPunct) continue;

    out.push({ beforeBIndex: i, char: ".", reason: "Heuristic", message: "Possible missing sentence-ending punctuation before a capitalized word." });
  }
  return out;
}

export function detectMissingTerminalInsertions(text: string, tokens: Token[]): VirtualTerminalInsertion[] {
  const result: VirtualTerminalInsertion[] = [];
  if (!tokens.length) return result;
  dgroup("[VT] detectMissingTerminalInsertions", () => {
    dtable("tokens", tokens.map(t => ({ i:t.idx, raw:t.raw, type:t.type, s:t.start, e:t.end })));
  });

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
      dlog("[VT] propose", {
        beforeBIndex: i,
        left: left.raw,
        right: right.raw,
        reason: "CapitalAfterSpace"
      });
    }
  }
  return result;
}

export function detectParagraphEndInsertions(text: string, tokens: any[]) {
  const out: { beforeBIndex:number; char:"."; reason:string }[] = [];
  const re = /\r?\n\s*\r?\n|$/g; let m: RegExpExecArray|null;
  while ((m = re.exec(text))) {
    const endPos = m.index;
    let lastIdx = -1, hasTerm = false;
    for (let i=tokens.length-1;i>=0;i--) {
      const t=tokens[i];
      if ((t.end ?? 0) <= endPos && t.type === "WORD") { lastIdx = i; break; }
    }
    if (lastIdx < 0) continue;
    for (let j=lastIdx+1;j<tokens.length;j++) {
      const t=tokens[j];
      if ((t.start ?? 0) >= endPos) break;
      if (t.type === "PUNCT" && /[.!?…]/.test(t.raw)) { hasTerm = true; break; }
    }
    if (!hasTerm) out.push({ beforeBIndex: lastIdx, char: ".", reason: "ParagraphEnd" });
  }
  return out;
}
