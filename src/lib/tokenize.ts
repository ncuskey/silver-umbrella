import type { Token } from "./types";

/**
 * Deterministic tokenizer (manual scan) that yields WORD/PUNCT/BOUNDARY tokens.
 * - Contractions/possessives stay as one WORD: don't, we're, Alex's, children’s
 * - Hyphenated words stay as one WORD: well-known, mother-in-law
 * - Numbers are treated as WORD for KPI counting rules to decide later
 * - Spaces are skipped (we don't emit SPACE tokens)
 */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let idx = 0;
  const isLetter = (ch: string) => /[A-Za-z]/.test(ch);
  const isDigit  = (ch: string) => /[0-9]/.test(ch);
  const isWordJoiner = (ch: string) => ch === "'" || ch === "’" || ch === "-";

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const start = i;

    // Boundary caret
    if (ch === "^") {
      out.push({ idx: idx++, raw: "^", type: "BOUNDARY", start, end: start + 1 });
      i += 1;
      continue;
    }

    // Skip whitespace
    if (/\s/.test(ch)) { i += 1; continue; }

    // Word: letters and digits (numbers), allowing internal - ' ’ between letters
    if (isLetter(ch) || isDigit(ch)) {
      let j = i + 1;
      while (j < text.length) {
        const cj = text[j];
        if (isLetter(cj) || isDigit(cj)) { j += 1; continue; }
        // Permit joiner followed by a letter (handles don't, well-known)
        if (isWordJoiner(cj) && j + 1 < text.length && isLetter(text[j + 1])) { j += 2; continue; }
        break;
      }
      const raw = text.slice(i, j);
      out.push({ idx: idx++, raw, type: "WORD", start: i, end: j });
      i = j;
      continue;
    }

    // Single-character punctuation fallback
    out.push({ idx: idx++, raw: ch, type: "PUNCT", start, end: start + 1 });
    i += 1;
  }

  return out;
}
