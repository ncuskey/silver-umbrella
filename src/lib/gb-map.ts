import type { Token } from "./types";

export type TokState = 'ok' | 'maybe' | 'bad';

export interface GBEdit {
  start: number;
  end: number;
  err_cat?: string;
  replace: string;
  err_desc?: string;
  edit_type?: string;
}

export interface TerminalGroupModel {
  id: string;
  state: TokState;
  leftIdx: number;
  dotIdx: number;
  rightIdx: number;
}

export function bootstrapStatesFromGB(
  text: string,
  tokens: Token[],
  edits: GBEdit[]
): TerminalGroupModel[] {
  // 1) default to ok
  for (const t of tokens) (t as any).state = 'ok';

  // 2) words
  for (const e of edits) {
    if (e.err_cat === 'SPELL') {
      for (const t of tokensInSpan(tokens, e.start, e.end)) {
        if (t.type === 'WORD') (t as any).state = 'bad';
      }
    }
    if (e.err_cat === 'GRMR') {
      const t = tokenAtOffset(tokens, e.start);
      if (t && t.type === 'WORD') (t as any).state = 'maybe';
    }
  }

  // 3) terminal groups
  const groups: TerminalGroupModel[] = [];
  for (const e of edits) {
    if (e.err_cat === 'PUNC' && e.replace === '.' && e.start < text.length) {
      const beforeWordIdx = wordIndexEndingAt(tokens, e.start);
      if (beforeWordIdx != null) {
        groups.push(makeTerminalGroup(tokens, beforeWordIdx, 'maybe')); // creates ^ . ^ wrapper
      }
    }
  }
  return groups;
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
