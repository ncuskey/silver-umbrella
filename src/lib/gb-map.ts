import type { Token } from "./types";
import type { TokenModel } from "@/components/Token";
import type { TerminalGroupModel } from "@/components/TerminalGroup";
import { buildTerminalGroups as buildTerminalGroupsNew } from "./buildTerminalGroups";
import { gbToVtInsertions, withParagraphFallbackDots } from "./paragraphUtils";

export type TokState = 'ok' | 'maybe' | 'bad';

export interface GBEdit {
  start: number;
  end: number;
  err_cat?: string;
  replace: string;
  err_desc?: string;
  err_type?: string;
  edit_type?: string;
}

export function bootstrapStatesFromGB(
  text: string,
  tokens: Token[],
  edits: GBEdit[]
): { tokenModels: TokenModel[]; terminalGroups: TerminalGroupModel[] } {
  // 1) Create token models with initial states
  const tokenModels: TokenModel[] = tokens.map((token, index) => ({
    id: `token-${index}`,
    kind: token.type === 'WORD' ? 'word' : 
          token.raw === '^' ? 'caret' :
          token.raw === '.' || token.raw === '!' || token.raw === '?' ? 'dot' :
          token.raw === '\n' ? 'newline' : 'word',
    text: token.raw,
    state: 'ok' as TokState
  }));

  // 2) Apply GB-driven states to words (ignore PUNC edits for word coloring)
  for (const e of edits) {
    const cat = (e.err_cat || '').toUpperCase();
    const type = (e.err_type || '').toUpperCase();
    if (cat === 'PUNC') continue; // don't touch words; the terminal group visual handles it
    if (cat === 'SPELL') {
      for (const t of tokensInSpan(tokens, e.start, e.end)) {
        const tokenIndex = tokens.indexOf(t);
        if (tokenIndex !== -1 && t.type === 'WORD') {
          tokenModels[tokenIndex].state = 'bad';
        }
      }
    }
    const original = text.slice(e.start, e.end);
    const isCapRewrite = !!(e.replace && original && e.replace.toLowerCase() === original.toLowerCase() && e.replace !== original);
    // Also detect capitalization when GB returns a wide GRMR edit starting at this token
    const firstTok = tokenAtOffset(tokens, e.start);
    const firstWordInReplace = (e.replace || '').match(/[A-Za-z]+(?:[-'’][A-Za-z]+)*/)?.[0] || '';
    const isCapOfFirstWord = !!(firstTok && firstTok.type === 'WORD' && firstWordInReplace && firstWordInReplace.toLowerCase() === (firstTok.raw || '').toLowerCase() && firstWordInReplace !== (firstTok.raw || ''));
    const isCapitalization = isCapRewrite || isCapOfFirstWord || /CAP|CASE|CASING|UPPER/i.test(type) || /capital/i.test(e.err_desc || '');
    const isGrammar = cat === 'GRMR' || cat === 'GRAMMAR' || /GRAMMAR/.test(type);
    if (isCapitalization || isGrammar) {
      const t = tokenAtOffset(tokens, e.start);
      if (t) {
        const tokenIndex = tokens.indexOf(t);
        if (tokenIndex !== -1 && t.type === 'WORD') {
          const rep = e.replace || '';
          const WORD_RE = /^[A-Za-z]+(?:[-'’][A-Za-z]+)*$/;
          const isWordSwap = isGrammar && WORD_RE.test(rep) && rep.toLowerCase() !== (t.raw || '').toLowerCase();
          tokenModels[tokenIndex].state = (isCapitalization || isWordSwap) ? 'bad' : 'maybe';
        }
      }
    }
  }

  // 3) Build terminal groups using VT insertions (both INSERT PUNC and MODIFY containing terminators)
  const vt = withParagraphFallbackDots(gbToVtInsertions({ edits } as any, text, tokens), text, tokens);
  const gbInserts = vt.map(v => ({ anchorIndex: v.beforeBIndex }));

  const paragraphs = getParagraphs(text, tokens);
  const terminalGroupsRaw = buildTerminalGroupsNew(tokens, gbInserts, paragraphs);
  
  // Convert to TerminalGroupModel format
  const terminalGroups: TerminalGroupModel[] = terminalGroupsRaw.map(g => ({
    id: g.id,
    anchorIndex: g.anchorIndex,
    status: g.status,
    selected: g.selected,
    source: g.source
  }));

  return { tokenModels, terminalGroups };
}

function tokensInSpan(tokens: Token[], start: number, end: number): Token[] {
  return tokens.filter(t => t.start >= start && t.end <= end);
}

function tokenAtOffset(tokens: Token[], offset: number): Token | null {
  return tokens.find(t => t.start <= offset && t.end > offset) || null;
}

function wordIndexEndingAt(tokens: Token[], offset: number): number | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.type === 'WORD' && t.end === offset) {
      return i;
    }
  }
  return null;
}

function mapOffsetToBoundaryIndex(offset: number, tokens: Token[]): number {
  // Find the token that contains or is after this offset
  const tokenIndex = tokens.findIndex(t => t.start >= offset);
  if (tokenIndex === -1) {
    // Offset is after all tokens, so it's the end boundary
    return tokens.length;
  }
  return tokenIndex;
}

function getParagraphs(text: string, tokens: Token[]): Array<{ start: number; end: number }> {
  const paragraphs = text.split(/\r?\n/);
  const result: Array<{ start: number; end: number }> = [];
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
      // Find the first token in this paragraph
      let startTokenIdx = -1;
      for (let j = 0; j < tokens.length; j++) {
        if (tokens[j].start >= currentOffset) {
          startTokenIdx = j;
          break;
        }
      }
      
      if (startTokenIdx !== -1) {
        result.push({ start: startTokenIdx, end: endTokenIdx });
      }
    }
    
    // Move to next paragraph (accounting for newline)
    currentOffset = paragraphEndOffset + 1; // +1 for the newline
  }
  
  return result;
}
