// src/lib/cws-lt.ts
import type { Token } from "@/lib/spell/types";
import type { GrammarIssue } from "@/lib/spell/types";
import { ESSENTIAL_PUNCT } from "@/lib/cws";
import { DEBUG, dgroup, dtable, dlog } from "@/lib/utils";

export function caretAfterMatch(m: any, tokens: any[]) {
  const after = m.offset + m.length;
  const next = tokens.find((t: any) => (t.start ?? 0) >= after);
  return next ? next.idx - 1 : tokens.length - 1;
}

function tokenIndexAt(charPos: number, tokens: any[]) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t.start ?? 0) <= charPos && charPos < (t.end ?? 0)) return i;
    if ((t.start ?? 0) > charPos) return Math.max(0, i - 1);
  }
  return tokens.length - 1;
}

function isLikelyListComma(tokens: any[], caretIdx: number) {
  // caret between tokens[caretIdx] and tokens[caretIdx+1]
  const L = tokens[caretIdx], R = tokens[caretIdx + 1];
  if (!L || !R || L.type !== "WORD" || R.type !== "WORD") return false;

  // Case A: Oxford/serial comma: comma before (and|or) + WORD
  const r1 = tokens[caretIdx + 1];
  const r2 = tokens[caretIdx + 2];
  const conjRight = r1 && r1.type === "WORD" && /^(and|or)$/i.test(r1.raw);
  if (conjRight && r2 && r2.type === "WORD") {
    // look back for another comma within a few tokens -> list of 3+
    for (let k = Math.max(0, caretIdx - 5); k <= caretIdx; k++) {
      const t = tokens[k];
      if (t && t.type === "PUNCT" && t.raw === ",") return true;
    }
  }

  // Case B: mid-list comma between items when a later (and|or) exists
  for (let j = caretIdx + 1, seenWord = false; j < Math.min(tokens.length, caretIdx + 7); j++) {
    const t = tokens[j];
    if (t.type === "PUNCT" && /[.?!;]/.test(t.raw)) break;
    if (t.type === "WORD") {
      if (/^(and|or)$/i.test(t.raw)) { /* keep scanning */ }
      else { seenWord = true; }
      // WORD , ... (and|or) WORD
      if (seenWord && tokens.slice(j).some(u => u.type === "WORD" && /^(and|or)$/i.test(u.raw))) {
        return true;
      }
    }
  }
  return false;
}

function suggestsTerminal(m: any) {
  const reps = Array.isArray(m.replacements) ? m.replacements : [];
  return reps.some((r: any) => /^[.?!]$/.test((r?.value || "").trim()));
}

// keep list/serial commas for CWS; ignore clause commas
export function isCommaOnlyForCWS(m: any, tokens: any[]) {
  const id  = (m.rule?.id || "").toUpperCase();
  const msg = m.message || "";
  const reps = Array.isArray(m.replacements) ? m.replacements : [];
  const commaOnly = reps.length > 0 && reps.every((r: any) => (r?.value || "").trim() === ",");
  const mentionsComma = /(^|[^a-z])comma([^a-z]|$)/i.test(msg) || id.includes("COMMA");
  if (!(commaOnly || mentionsComma)) return false;

  const caretIdx = caretAfterMatch(m, tokens);
  const next = tokens[caretIdx + 1], next2 = tokens[caretIdx + 2];
  const oxford = next?.type === "WORD" && /^(and|or)$/i.test(next.raw) && next2?.type === "WORD";
  return oxford ? false : true;
}

const STOP_LEFT = new Set(["and", "or", "but", "so", "then", "yet"]);
const BOUNDARY_CATEGORIES = new Set(["PUNCTUATION", "GRAMMAR", "STYLE", "TYPOGRAPHY"]);

const isWord = (t: Token) => t.type === "WORD";
const isEssentialPunct = (t: Token) => t.type === "PUNCT" && ESSENTIAL_PUNCT.has(t.raw);

// LanguageTool rule/category IDs related to punctuation and sentence structure
const PUNCT_IDS = new Set([
  "PUNCTUATION", "UPPERCASE_SENTENCE_START", "EN_QUOTES", "MISSING_SENTENCE_TERMINATOR", "PUNCTUATION_PARAGRAPH_END"
]);

// Rule → UI mapping (expanded for better parity with LT website)
export const RULE_MAPPINGS: Record<string, {tag: string; label: string}> = {
  // spelling
  "MORFOLOGIK_RULE_EN_US": { tag: "SPELLING", label: "Spelling error" },
  "MORFOLOGIK_RULE_EN_GB": { tag: "SPELLING", label: "Spelling error" },

  // punctuation & capitalization
  "PUNCTUATION_PARAGRAPH_END": { tag: "TERMINAL", label: "Sentence may be missing terminal punctuation" },
  "UPPERCASE_SENTENCE_START": { tag: "CAPITALIZATION", label: "Expected capital after sentence-ending punctuation" },

  // style/grammar (non-premium)
  "TOO_LONG_SENTENCE": { tag: "RUN_ON", label: "Long sentence (possible run-on)" },
  "COMMA_PARENTHESIS_WHITESPACE": { tag: "PUNCTUATION", label: "Spacing around punctuation" },
  "WHITESPACE_RULE": { tag: "TYPOGRAPHY", label: "Unusual spacing" }
};

// Fallback gracefully
export const mapRule = (id: string, cat: string) =>
  RULE_MAPPINGS[id] ?? { tag: (cat || "OTHER").toUpperCase(), label: "" };

export interface CwsHint {
  bIndex: number;          // -1 or token index
  message: string;
  ruleId?: string;
  categoryId?: string;
}

/** Boundaries eligible for CWS: initial (-1) + between WORD/essential-punct units */
function unitIndices(tokens: Token[]): number[] {
  const out: number[] = [];
  tokens.forEach((t, i) => { if (isWord(t) || isEssentialPunct(t)) out.push(i); });
  return out;
}

function boundaryCharPos(tokens: Token[], bIndex: number): number {
  // -1 = before first unit
  if (bIndex === -1) {
    const u0 = tokens.find((t) => isWord(t) || isEssentialPunct(t));
    return u0?.start ?? 0;
  }
  const t = tokens[bIndex];
  return t?.end ?? 0; // boundary sits *after* left unit
}

function isCwsCategory(issue: GrammarIssue) {
  const id = (issue.categoryId || "").toUpperCase();
  const ruleId = (issue.ruleId || "").toUpperCase();
  const category = (issue.category || "").toUpperCase();
  
  // Allow punctuation-related issues that are relevant to CWS
  if (PUNCT_IDS.has(id) || PUNCT_IDS.has(ruleId)) return true;
  
  // exclude spelling/typography – those we already handle
  if (id === "TYPOS" || id === "TYPOGRAPHY" || category === "TYPOS" || ruleId.startsWith("MORFOLOGIK_RULE")) return false;
  
  return true; // GRAMMAR, AGREEMENT, CONFUSED_WORDS, WORD_USAGE, MISC, etc.
}

/** Attach LT hints to the nearest eligible CWS boundary (within ±2 chars). */
const isPunctOrGrammar = (m: any) => {
  const cat = (m.category?.id || "").toUpperCase();
  return cat === "PUNCTUATION" || cat === "GRAMMAR";
};

// Rules that indicate sentence-end problems straight from LT:
const LT_TERMINAL_RULE_IDS = new Set<string>([
  "PUNCTUATION_PARAGRAPH_END",   // "No punctuation mark at the end of paragraph"
  "MISSING_SENTENCE_TERMINATOR", // "Missing sentence terminator"
  "SENTENCE_WHITESPACE"          // "Missing space between sentences"
]);

// Defensive text-match for other sentence/punctuation wordings LT uses
const looksLikeSentenceEndMsg = (msg: string) =>
  /(?:missing|no)\s+(?:[.!?]|punctuation).*?(?:sentence|end|paragraph)/i.test(msg);

export function deriveTerminalFromLT(tokens: Token[], issues: any[]) {
  const carets = new Set<number>(); // caret index = position *between* tokens

  // keep everything except comma-only
  const ltIssuesForCWS = issues.filter((m) => !isCommaOnlyForCWS(m, tokens));

  // A) End-of-paragraph punctuation
  for (const m of ltIssuesForCWS) {
    const rId = (m.rule?.id || "").toUpperCase();
    if (!LT_TERMINAL_RULE_IDS.has(rId)) continue;

    // anchor at the boundary after the last token covered by the match
    const endChar = m.offset + m.length;
    // Find the last token that ends before or at the endChar position
    let leftTok: Token | undefined;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if ((tokens[i].end ?? 0) <= endChar) {
        leftTok = tokens[i];
        break;
      }
    }
    if (leftTok) {
      carets.add(leftTok.idx);
    }
  }

  // B) Missing boundary *inside* a paragraph (e.g., "forest The", "trees Then")
  for (const m of ltIssuesForCWS) {
    const msg = m.message || "";
    const rId = (m.rule?.id || "").toUpperCase();

    // Check for UPPERCASE_SENTENCE_START rule specifically
    if (rId === "UPPERCASE_SENTENCE_START") {
      // Find the token that the issue points to (the capitalized word)
      const capitalizedToken = tokens.find(t => (t.start ?? 0) >= m.offset && (t.start ?? 0) < m.offset + m.length);
      if (capitalizedToken && capitalizedToken.type === "WORD" && /^[A-Z]/.test(capitalizedToken.raw)) {
        // Find the previous word token
        const prevWordIdx = capitalizedToken.idx - 1;
        if (prevWordIdx >= 0) {
          const prevToken = tokens[prevWordIdx];
          if (prevToken && prevToken.type === "WORD") {
            carets.add(prevWordIdx);
          }
        }
      }
    }

    // For other rules, check if they're punctuation/grammar related
    if (!isPunctOrGrammar(m)) continue;
    
    // Strict LT-only: only react to specific terminal rules
    if (!LT_TERMINAL_RULE_IDS.has(rId)) continue;

    // find the token that starts *right after* the match
    const after = m.offset + m.length;
    const next = tokens.find(t => (t.start ?? 0) >= after);
    const prevIdx = next ? next.idx - 1 : tokens.length - 1;

    // require no punctuation in between and the next token to be capitalized (The, Then, I, ...)
    const prev = tokens[prevIdx];
    if (!prev || prev.type !== "WORD") continue;
    const nextWord = next && next.type === "WORD" ? next : null;
    if (!nextWord || !next) continue;

    const gap = (prev.end ?? 0) === (next.start ?? 0) || /^[ \t]+$/.test(
      (prev.end ?? 0) < (next.start ?? 0) ? "" : "" // you already know they're adjacent; spaces-only gap is okay
    );
    const capitalized = /^[A-Z]/.test(nextWord.raw);

    if (gap && capitalized) carets.add(prevIdx);
  }

  return carets;
}

// Convert LT-derived terminals to VirtualTerminalInsertion format
export function convertLTTerminalsToInsertions(tokens: Token[], issues: any[]): Array<{
  beforeBIndex: number;
  message: string;
  char: "." | "!" | "?";
  reason: "LT";
}> {
  const carets = deriveTerminalFromLT(tokens, issues);
  const insertions: Array<{
    beforeBIndex: number;
    message: string;
    char: "." | "!" | "?";
    reason: "LT";
  }> = [];

  for (const caretIdx of carets) {
    // Find the token at this boundary
    const tokenIdx = caretIdx;
    if (tokenIdx >= 0 && tokenIdx < tokens.length) {
      insertions.push({
        beforeBIndex: tokenIdx,
        message: "Possible missing sentence-ending punctuation (from LanguageTool).",
        char: ".",
        reason: "LT"
      });
    }
  }

  return insertions;
}

export type TerminalGroup = {
  ruleId: string;
  message: string;
  tokenRange: [number, number];     // inclusive token indices of the chunk
  groupLeftCaret: number;           // caret before tokenRange[0]
  primaryCaret: number;             // caret at proposed punctuation location
  groupRightCaret: number;          // caret after tokenRange[1]
};

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && a1 > b0;

function caretBetweenToken(i: number) { return i; }  // 0..tokens.length-1
function leftCaretOfToken(i: number) { return i - 1; }
function rightCaretOfToken(i: number) { return i; }

export function buildTerminalGroups(
  tokens: Token[],
  carets: Map<number, "yellow" | "red" | "green">,
  ltIssues: any[]
): TerminalGroup[] {
  const groups: TerminalGroup[] = [];

  const isPunctOrGrammar = (m: any) => {
    const cat = (m.category?.id || "").toUpperCase();
    return cat === "PUNCTUATION" || cat === "GRAMMAR";
  };

  // keep everything except comma-only
  const ltIssuesForCWS = ltIssues.filter((m) => !isCommaOnlyForCWS(m, tokens));

  for (const m of ltIssuesForCWS) {
    const rid = (m.rule?.id || "").toUpperCase();
    const msg = m.message || "";

    // only use punctuation/grammar LT issues as anchors
    if (!isPunctOrGrammar(m)) continue;

    // primary caret: boundary immediately after the match span
    const end = m.offset + m.length;
    const nextTokIdx = tokens.findIndex(t => (t.start ?? 0) >= end);
    const boundary = Math.max(0, (nextTokIdx === -1 ? tokens.length : nextTokIdx) - 1);
    const primaryCaret = caretBetweenToken(boundary);

    // expand to group edges: walk to nearest non-yellow caret on each side
    const lastCaret = tokens.length; // carets are 0..tokens.length
    let left = primaryCaret - 1;
    while (left > 0 && (carets.get(left) ?? "yellow") === "yellow") left--;
    if (left < 0) left = 0;

    let right = primaryCaret + 1;
    while (right < lastCaret && (carets.get(right) ?? "yellow") === "yellow") right++;
    if (right > lastCaret) right = lastCaret;

    // compute token range spanned by [left,right]
    const startTok = Math.max(0, right === 0 ? 0 : right - 1);
    const endTok = Math.min(tokens.length - 1, left);

    const tokenRange: [number, number] = [
      Math.max(0, primaryCaret), // safe lower bound
      Math.min(tokens.length - 1, primaryCaret) // safe upper bound
    ];

    groups.push({
      ruleId: rid,
      message: msg,
      tokenRange,
      groupLeftCaret: left,
      primaryCaret,
      groupRightCaret: right
    });
  }

  return groups;
}

// ---- revised detector ----

// --- NEW: accept all LT boundary suggestions and convert to virtual terminals --- //
import type { VirtualTerminalInsertion } from "@/lib/cws-heuristics";

function nearestBoundaryToRange(tokens: Token[], start: number, end: number): number {
  // Find the token boundary closest to the range
  const center = start + (end - start) / 2;
  return tokenIndexAt(center, tokens);
}


function isWordTok(t?: Token) {
  return !!t && t.type === "WORD";
}

function looksLikeTerminalSuggestion(issue: GrammarIssue): boolean {
  const id = (issue.ruleId || "").toUpperCase();
  const cat = (issue.categoryId || "").toUpperCase();
  const msg = (issue.message || "").toLowerCase();
  const hasTerminalReplacement = (issue.replacements || []).some(r => /^[.!?]/.test(r.trim()));

  // Very permissive on purpose (accept first, filter later):
  return (
    hasTerminalReplacement ||
    LT_TERMINAL_RULE_IDS.has(id) ||
    id.includes("PUNCTUATION") ||
    id.includes("SENTENCE") ||
    /end of sentence|missing terminal|add (a )?(period|full stop)/i.test(msg) ||
    (cat === "PUNCTUATION" && /sentence|terminal/i.test(msg))
  );
}

// Commas are not counted in CWS unless genuinely part of a list
function isListCommaContext(tokens: Token[], bIndex: number): boolean {
  // A tiny heuristic: word , word (, word)* (and|or) word
  // For CWS we only keep commas in list contexts; others are ignored outright.
  const win = tokens.slice(Math.max(0, bIndex - 3), Math.min(tokens.length, bIndex + 5))
                    .map(t => t.raw.toLowerCase());

  // if we see 'and'/'or' nearby and both sides are words, treat as listy
  const hasCoord = win.includes("and") || win.includes("or");
  const leftWord  = isWordTok(tokens[bIndex]);
  const rightWord = isWordTok(tokens[bIndex + 1]);
  return hasCoord && leftWord && rightWord;
}

export function ltBoundaryInsertions(
  text: string,
  tokens: Token[],
  issues: GrammarIssue[]
): VirtualTerminalInsertion[] {
  if (!issues?.length || !tokens?.length) return [];

  const out: VirtualTerminalInsertion[] = [];
  const seen = new Set<number>();

  for (const m of issues) {
    const id = (m.ruleId || "").toUpperCase();
    const msg = m.message || "";

    // Filter commas up front (we accept all LT issues first, but we don't let
    // commas through unless listy — and we don't add commas to CWS anyway)
    const mentionsComma = /\bcomma\b/i.test(msg) || id.includes("COMMA");
    if (mentionsComma) {
      const b = nearestBoundaryToRange(tokens, m.offset, m.offset + m.length);
      if (!isListCommaContext(tokens, b)) continue;   // ignore non-list commas
      // Even for list commas, CWS does not insert a terminal — so skip.
      continue;
    }

    if (!looksLikeTerminalSuggestion(m)) continue;

    const bIndex = nearestBoundaryToRange(tokens, m.offset, m.offset + m.length);
    if (bIndex < 0) continue;
    if (seen.has(bIndex)) continue;
    seen.add(bIndex);

    out.push({
      beforeBIndex: bIndex,
      char: ".", // default; LT rarely tells us "!" or "?"
      reason: "LT",
      message: m.message || "Possible missing sentence-ending punctuation (LanguageTool).",
    });
  }

  return out;
}

export function buildLtCwsHints(text: string, tokens: Token[], issues: GrammarIssue[]) {
  if (DEBUG) {
    dgroup("[CWS/LT] tokens", () => dtable("tokens", tokens.map(t => ({
      idx: t.idx, raw: t.raw, type: t.type, start: t.start, end: t.end
    }))));
    dgroup("[CWS/LT] raw issues", () => dtable("issues", issues.map(m => ({
      off: m.offset, len: m.length, rule: m.ruleId, cat: m.categoryId, msg: m.message
    }))));
  }
  const hints = new Map<number, CwsHint>();
  const units = unitIndices(tokens);

  const boundaries: number[] = [-1, ...units.slice(0, -1)]; // -1 plus between-unit indices
  const bPos = boundaries.map((b) => boundaryCharPos(tokens, b));

  // keep everything except comma-only
  const ltIssuesForCWS = issues.filter((m) => !isCommaOnlyForCWS(m, tokens));

  for (const iss of ltIssuesForCWS) {
    if (!isCwsCategory(iss)) continue;
    const center = iss.offset + Math.floor(iss.length / 2);

    // Check if this is a punctuation-related issue
    const isPunctIssue = PUNCT_IDS.has((iss.categoryId || "").toUpperCase()) || 
                        PUNCT_IDS.has((iss.ruleId || "").toUpperCase());

    // pick nearest boundary within a small window
    let bestB = null as number | null;
    let bestD = Infinity;
    
    for (let i = 0; i < boundaries.length; i++) {
      const d = Math.abs(center - bPos[i]);
      
      // For punctuation issues, prefer the boundary before the capitalized token
      if (isPunctIssue && d < bestD) {
        // If this is a punctuation issue and we're looking at a boundary that comes before the issue,
        // prefer it over boundaries that come after
        if (bPos[i] <= center) {
          bestD = d;
          bestB = boundaries[i];
        } else if (bestB === null) {
          // Only use a boundary after the issue if we haven't found one before
          bestD = d;
          bestB = boundaries[i];
        }
      } else if (d < bestD) {
        bestD = d;
        bestB = boundaries[i];
      }
    }
    
    if (bestB === null) continue;
    if (bestD > 2) continue; // too far from any boundary

    // In buildLtCwsHints(), just after you compute bIndex:
    if (/\bcomma\b/i.test(iss.message) || iss.ruleId?.toUpperCase().includes("COMMA")) {
      if (!isListCommaContext(tokens, bestB)) return; // skip non-list commas in hints
      // you can also choose to skip list commas completely for CWS hints as well
    }

    // only keep the first hint per boundary
    if (!hints.has(bestB)) {
      // Use mapped message if available, otherwise use original message
      const mapped = mapRule(iss.ruleId || "", iss.categoryId || "");
      const mappedMessage = mapped.label || iss.message;
      hints.set(bestB, {
        bIndex: bestB,
        message: mappedMessage,
        ruleId: iss.ruleId,
        categoryId: iss.categoryId
      });
    }
  }
  return hints;
}
