// src/lib/cws-lt.ts
import type { Token } from "@/lib/spell/types";
import type { GrammarIssue } from "@/lib/spell/types";
import { ESSENTIAL_PUNCT } from "@/lib/cws";

const isWord = (t: Token) => t.type === "WORD";
const isEssentialPunct = (t: Token) => t.type === "PUNCT" && ESSENTIAL_PUNCT.has(t.raw);

// LanguageTool rule/category IDs related to punctuation and sentence structure
const PUNCT_IDS = new Set([
  "PUNCTUATION", "UPPERCASE_SENTENCE_START", "EN_QUOTES", "MISSING_SENTENCE_TERMINATOR"
]);

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
  
  // Allow punctuation-related issues that are relevant to CWS
  if (PUNCT_IDS.has(id) || PUNCT_IDS.has(ruleId)) return true;
  
  // exclude spelling/typography – those we already handle
  if (id === "TYPOS" || id === "TYPOGRAPHY") return false;
  
  return true; // GRAMMAR, AGREEMENT, CONFUSED_WORDS, WORD_USAGE, MISC, etc.
}

/** Attach LT hints to the nearest eligible CWS boundary (within ±2 chars). */
export function buildLtCwsHints(text: string, tokens: Token[], issues: GrammarIssue[]) {
  const hints = new Map<number, CwsHint>();
  const units = unitIndices(tokens);

  const boundaries: number[] = [-1, ...units.slice(0, -1)]; // -1 plus between-unit indices
  const bPos = boundaries.map((b) => boundaryCharPos(tokens, b));

  for (const iss of issues) {
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

    // only keep the first hint per boundary
    if (!hints.has(bestB)) {
      hints.set(bestB, {
        bIndex: bestB,
        message: iss.message,
        ruleId: iss.ruleId,
        categoryId: iss.categoryId
      });
    }
  }
  return hints;
}
