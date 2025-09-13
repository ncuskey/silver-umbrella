import type { Token, VirtualTerminalInsertion } from "./types";
import type { GbEdit } from "./gbClient";

/**
 * Convert character offset to boundary index
 */
export function charOffsetToBoundaryIndex(offset: number, tokens: Token[], text: string): number | null {
  // Find the token that contains or is after this offset
  const tokenIndex = tokens.findIndex(t => t.start >= offset);
  if (tokenIndex === -1) {
    // Offset is after all tokens, so it's the end boundary
    return tokens.length;
  }
  return tokenIndex;
}

/**
 * Convert character offset to token index
 */
export function charOffsetToTokenIndex(offset: number, tokens: Token[]): number | null {
  const tokenIndex = tokens.findIndex(t => t.start <= offset && t.end > offset);
  return tokenIndex === -1 ? null : tokenIndex;
}

/**
 * Detect paragraph boundaries (newline positions) and return boundary indices
 */
export function newlineBoundarySet(text: string, tokens: Token[]): Set<number> {
  const set = new Set<number>();
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      const b = charOffsetToBoundaryIndex(i, tokens, text);
      if (b != null) set.add(b);
    }
  }
  return set;
}

/**
 * Convert GB edits to VT insertions, filtering out end-of-text insertions
 */
export function gbToVtInsertions(gb: { edits?: GbEdit[] }, text: string, tokens: Token[]): VirtualTerminalInsertion[] {
  const N = tokens.length;
  const out: VirtualTerminalInsertion[] = [];
  const seen = new Set<string>(); // key = `${b}|${ch}`

  const push = (b: number | null, at: number, ch: "."|"!"|"?", msg?: string) => {
    const beforeBIndex = b == null ? N : b;
    const key = `${beforeBIndex}|${ch}`;
    if (beforeBIndex < 0 || beforeBIndex > N) return;
    if (seen.has(key)) return;
    out.push({ at, char: ch, beforeBIndex, reason: "GB", message: msg || `Add ${ch}` });
    seen.add(key);
  };

  const edits = gb.edits ?? [];
  // 1) Direct INSERT PUNC → terminal
  for (const e of edits) {
    if (e.edit_type === "INSERT" && e.err_cat === "PUNC" && (e.replace === "." || e.replace === "!" || e.replace === "?")) {
      const b = charOffsetToBoundaryIndex(e.start, tokens, text);
      push(b, e.start, e.replace as any, e.err_desc);
    }
  }

  // 2) MODIFY that contains one or more sentence terminators in the replacement
  //    Example: ". We" (at start) or "broke. My" (internal)
  for (const e of edits) {
    if (e.edit_type !== "MODIFY") continue;
    const repl = e.replace || "";
    for (let i = 0; i < repl.length; i++) {
      const ch = repl[i] as any;
      if (ch === "." || ch === "!" || ch === "?") {
        const at = e.start + i; // approximate insertion offset within span
        const b = charOffsetToBoundaryIndex(at, tokens, text);
        push(b, at, ch, e.err_desc || `Add ${ch}`);
      }
    }
  }

  return out.sort((a, b) => a.beforeBIndex - b.beforeBIndex);
}

/**
 * Add paragraph-end fallback dots at newline boundaries where GB didn't suggest punctuation
 * Respects paragraphs and suppresses the very last terminal
 */
export function withParagraphFallbackDots(
  base: VirtualTerminalInsertion[],
  text: string,
  tokens: Token[]
): VirtualTerminalInsertion[] {
  const N = tokens.length;
  const byBoundary = new Set(base.map(b => b.beforeBIndex));
  
  // Split text into paragraphs and track their end token indices
  const paragraphs = text.split(/\r?\n/);
  const paragraphEndTokenIndices = getParagraphEndTokenIndices(paragraphs, tokens);
  
  const extras: VirtualTerminalInsertion[] = [];
  
  for (let i = 0; i < paragraphEndTokenIndices.length; i++) {
    const endTokenIdx = paragraphEndTokenIndices[i];
    const isLastParagraph = i === paragraphEndTokenIndices.length - 1;
    const isLastTokenOverall = endTokenIdx === N - 1;
    
    const boundaryIdx = endTokenIdx + 1;
    
    // Permit last boundary (N) as well; dedupe via byBoundary set
    if (!byBoundary.has(boundaryIdx)) {
      // Check the token before the break; if it already ends with . ! ? we skip.
      const prevIdx = boundaryIdx - 1;
      const endsWithTerminal =
        prevIdx >= 0 && /[.!?]/.test(tokens[prevIdx].raw);

      if (!endsWithTerminal) {
        extras.push({ 
          at: tokens[prevIdx]?.end ?? 0,
          char: ".",
          beforeBIndex: boundaryIdx, 
          reason: "GB" as const,
          message: "Add period"
        });
      }
    }
  }
  
  return [...base, ...extras].sort((a, b) => a.beforeBIndex - b.beforeBIndex);
}

/**
 * Get the end token index for each paragraph
 */
function getParagraphEndTokenIndices(paragraphs: string[], tokens: Token[]): number[] {
  const endIndices: number[] = [];
  let currentOffset = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphEndOffset = currentOffset + paragraph.length;
    // Skip empty paragraphs created by consecutive newlines
    const isEmpty = paragraph.length === 0;
    
    // Find the last token that ends at or before this paragraph's end
    let endTokenIdx = -1;
    for (let j = 0; j < tokens.length; j++) {
      if (tokens[j].end <= paragraphEndOffset) {
        endTokenIdx = j;
      } else {
        break;
      }
    }
    
    if (!isEmpty && endTokenIdx !== -1) {
      if (endIndices.length === 0 || endIndices[endIndices.length - 1] !== endTokenIdx) {
        endIndices.push(endTokenIdx);
      }
    }
    
    // Move to next paragraph (accounting for newline)
    currentOffset = paragraphEndOffset + 1; // +1 for the newline
  }
  
  return endIndices;
}
