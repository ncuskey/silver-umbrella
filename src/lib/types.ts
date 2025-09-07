export type Token = {
  idx: number;
  raw: string;      // word, punctuation, caret "^", etc
  type: "WORD" | "PUNCT" | "SPACE" | "BOUNDARY" | string;
  start: number;
  end: number;
};

export type VirtualTerminalInsertion = {
  at: number;           // where the dot renders (char index in full text)
  char: "." | "!" | "?";
  beforeBIndex: number; // boundary token index (your VT grouping uses this)
  reason: "LT" | "GB";
  message: string;      // description of the insertion
};

// the LT payload is inconsistent across servers; keep it loose
export type LtIssue = any;
