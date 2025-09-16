export interface SpellChecker {
  /** Return true if `word` is spelled correctly (case-insensitive). */
  isCorrect(word: string): boolean;
  /** Optional suggestions for UI. */
  suggestions?(word: string, max?: number): string[];
}

export interface GrammarIssue {
  offset: number;     // 0-based char start
  length: number;
  category: string;   // e.g., "GRAMMAR", "PUNCTUATION", "CASING", "TYPOS"
  message: string;
  replacements?: string[];
  ruleId?: string;    // e.g., "MORFOLOGIK_RULE_EN_US"
  categoryId?: string; // e.g., "TYPOS"
}

export interface GrammarChecker {
  check(
    text: string,
    lang?: string,
    signal?: AbortSignal,
    level?: "default" | "picky"
  ): Promise<GrammarIssue[]>;
}

export interface Token {
  raw: string;
  type: "WORD" | "PUNCT";
  idx: number; // global index in token stream
  start?: number;  // NEW: 0-based char offset in the raw text
  end?: number;    // NEW: 0-based char offset in the raw text (exclusive)
}