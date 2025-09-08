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
  return (gb.edits ?? [])
    .filter(e => e.edit_type === "INSERT" && e.err_cat === "PUNC")
    .map(e => {
      const beforeBIndex = charOffsetToBoundaryIndex(e.start, tokens, text);
      return {
        at: e.start,
        char: (e.replace as "." | "!" | "?") ?? ".",
        beforeBIndex: beforeBIndex ?? N,
        reason: "GB" as const,
        message: e.err_desc || `Add ${e.replace}`
      };
    })
    .filter(x => x.beforeBIndex !== N);
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
    
    // Skip if this is the last paragraph and its end token is also the last token overall
    if (isLastParagraph && isLastTokenOverall) {
      continue;
    }
    
    const boundaryIdx = endTokenIdx + 1;
    
    if (boundaryIdx !== N && !byBoundary.has(boundaryIdx)) {
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
    
    // Find the last token that ends at or before this paragraph's end
    let endTokenIdx = -1;
    for (let j = 0; j < tokens.length; j++) {
      if (tokens[j].end <= paragraphEndOffset) {
        endTokenIdx = j;
      } else {
        break;
      }
    }
    
    if (endTokenIdx !== -1) {
      endIndices.push(endTokenIdx);
    }
    
    // Move to next paragraph (accounting for newline)
    currentOffset = paragraphEndOffset + 1; // +1 for the newline
  }
  
  return endIndices;
}
