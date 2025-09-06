export interface SpellChecker {
  /** Return true if `word` is spelled correctly (case-insensitive). */
  isCorrect(word: string): boolean;
  /** Optional suggestions for UI. */
  suggestions?(word: string, max?: number): string[];
}

export interface GrammarIssue {
  offset: number;     // 0-based char start in original text
  length: number;
  category: string;   // e.g., "GRAMMAR", "PUNCTUATION", "CASING"
  message: string;
  replacements?: string[];
}

export interface GrammarChecker {
  check(text: string, lang?: string, signal?: AbortSignal): Promise<GrammarIssue[]>;
}