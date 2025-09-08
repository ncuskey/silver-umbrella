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

  // 2) Apply GB-driven states to words
  for (const e of edits) {
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

  // 3) Create terminal groups
  const terminalGroups: TerminalGroupModel[] = [];
  for (const e of edits) {
    if (e.err_cat === 'PUNC' && e.replace === '.' && e.start < text.length) {
      const beforeWordIdx = wordIndexEndingAt(tokens, e.start);
      if (beforeWordIdx != null) {
        terminalGroups.push(makeTerminalGroup(tokens, beforeWordIdx, 'maybe'));
      }
    }
  }

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

function makeTerminalGroup(tokens: Token[], wordIdx: number, state: TokState): TerminalGroupModel {
  return {
    id: `tg-${wordIdx}`,
    state,
    leftIdx: wordIdx,
    dotIdx: wordIdx + 1,
    rightIdx: wordIdx + 2
  };
}
