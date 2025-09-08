import type { Token } from "./types";
import type { TokenModel } from "@/components/Token";
import type { TerminalGroupModel } from "@/components/TerminalGroup";

export type TokState = 'ok' | 'maybe' | 'bad';

export interface GBEdit {
  start: number;
  end: number;
  err_cat?: string;
  replace: string;
  err_desc?: string;
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
    if (e.err_cat === 'PUNC') continue; // don't touch words; the terminal group visual handles it
    if (e.err_cat === 'SPELL') {
      for (const t of tokensInSpan(tokens, e.start, e.end)) {
        const tokenIndex = tokens.indexOf(t);
        if (tokenIndex !== -1 && t.type === 'WORD') {
          tokenModels[tokenIndex].state = 'bad';
        }
      }
    }
    if (e.err_cat === 'GRMR') {
      const t = tokenAtOffset(tokens, e.start);
      if (t) {
        const tokenIndex = tokens.indexOf(t);
        if (tokenIndex !== -1 && t.type === 'WORD') {
          tokenModels[tokenIndex].state = 'maybe';
        }
      }
    }
  }

  // 3) Build terminal groups using the new deduplication logic
  const gbInserts = edits
    .filter(e => e.err_cat === 'PUNC' && e.edit_type === 'INSERT' && e.replace === '.')
    .map(e => ({ boundaryIdx: mapOffsetToBoundaryIndex(e.start, tokens) }));

  const paragraphs = getParagraphs(text, tokens);
  const terminalGroups = buildTerminalGroups(tokens, gbInserts, paragraphs);

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

function buildTerminalGroups(
  tokens: Token[],
  gbInserts: Array<{ boundaryIdx: number }>,
  paragraphs: Array<{ start: number; end: number }>,
): TerminalGroupModel[] {
  const groups: TerminalGroupModel[] = [];
  const byAnchor = new Map<number, TerminalGroupModel>();

  const add = (anchorIndex: number, status: TokState, source: 'GB'|'PARA') => {
    if (byAnchor.has(anchorIndex)) return;                  // ✅ de-dupe
    const g: TerminalGroupModel = { 
      id: `tg-${anchorIndex}`, 
      anchorIndex, 
      status, 
      selected: false, 
      source 
    };
    byAnchor.set(anchorIndex, g);
    groups.push(g);
  };

  // A) GB '.' inserts → maybe
  for (const e of gbInserts) {
    add(e.boundaryIdx, 'maybe', 'GB');
  }

  // B) Paragraph end terminals → maybe (except last paragraph and empty paras)
  paragraphs.forEach((p, i) => {
    const isLastPara = i === paragraphs.length - 1;
    // find last *word* token in the paragraph
    let lastWordIdx = -1;
    for (let k = p.end; k >= p.start; k--) {
      if (tokens[k]?.type === 'WORD') { lastWordIdx = k; break; }
    }
    const isEmpty = lastWordIdx === -1;
    if (isEmpty || isLastPara) return;                      // ✅ skip empty & final block

    const anchor = lastWordIdx + 1;
    add(anchor, 'maybe', 'PARA');                           // ✅ add only if not already added by GB
  });

  return groups;
}

