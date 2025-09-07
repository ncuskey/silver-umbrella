import type { Token } from "./types";

/**
 * Simple tokenizer that yields WORD/PUNCT/BOUNDARY ("^") tokens
 */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let idx = 0;
  
  // Include caret "^" in the regex to capture boundary markers
  const re = /\^|\w+|[^\s\w]/g;
  
  for (const m of text.matchAll(re)) {
    const start = m.index!;
    const end = start + m[0].length;
    const raw = m[0];
    
    let type: Token["type"];
    if (raw === "^") {
      type = "BOUNDARY";
    } else if (/\w/.test(raw)) {
      type = "WORD";
    } else {
      type = "PUNCT";
    }
    
    out.push({
      idx: idx++,
      raw,
      type,
      start,
      end
    });
  }
  
  return out;
}
