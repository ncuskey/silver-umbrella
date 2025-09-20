import type { LtEdit } from "./ltClient";
import type { Token, VirtualTerminalInsertion } from "./types";

export function groupInsertionsByBoundary(
  insertions: VirtualTerminalInsertion[]
): Map<number, VirtualTerminalInsertion[]> {
  const byB = new Map<number, VirtualTerminalInsertion[]>();
  for (const ins of insertions ?? []) {
    const b = ins.beforeBIndex ?? 0;           // boundary index already set in GB→VT
    if (!byB.has(b)) byB.set(b, []);
    byB.get(b)!.push(ins);
  }
  return byB;
}

/** Severity shown in the pill colors */
export type UiState = "correct" | "incorrect" | "possible";

export type DisplayToken = Token & {
  ui: UiState;
  overlay?: string;        // optional display text (e.g., capitalization)
  gbHits?: LtEdit[];       // edits intersecting this token
};

const TERMS = new Set([".", "!", "?"]);
const isWord = (t: Token) => /\w/.test(t.raw?.[0] ?? "");

export function annotateFromGb(
  text: string,
  tokens: Token[],
  edits: LtEdit[],
  opts?: { showCaps?: boolean }
): DisplayToken[] {
  const out: DisplayToken[] = tokens.map(t => ({ ...t, ui: "correct" as UiState, gbHits: [] }));

  for (const e of edits ?? []) {
    // 1) Attach edits to overlapping tokens
    let firstTok = tokens.findIndex(t => e.end > t.start && e.start < t.end);
    if (firstTok === -1) {
      const nextTok = tokens.findIndex(t => t.start >= e.end);
      // For INSERTs (pure punctuation), associate with the previous word; for MODIFY, associate with the next word
      if ((e as any).edit_type === 'INSERT') {
        firstTok = nextTok > 0 ? nextTok - 1 : tokens.length - 1;
      } else {
        firstTok = nextTok >= 0 ? nextTok : tokens.length - 1;
      }
    }

    if (firstTok < 0 || firstTok >= tokens.length) continue;
    const tk = out[firstTok];
    tk.gbHits!.push(e);

    // 2) Decide UI severity and optional overlay
    const cat = (e.err_cat || "").toUpperCase();
    const type = (e.err_type || "").toUpperCase();
    const original = text.slice(e.start, e.end);
    const isCapRewrite = !!(e.replace && original && e.replace.toLowerCase() === original.toLowerCase() && e.replace !== original);
    // Handle wide GRMR edits that include multiple tokens but start by capitalizing the first word
    const firstWordInReplace = (e.replace || "").match(/[A-Za-z]+(?:[-'’][A-Za-z]+)*/)?.[0] || "";
    const firstTokRaw = tk.raw || "";
    const isCapOfFirstWord = !!firstWordInReplace && firstWordInReplace.toLowerCase() === firstTokRaw.toLowerCase() && firstWordInReplace !== firstTokRaw;
    const isCapitalization = isCapRewrite || isCapOfFirstWord || /CAP|CASE|CASING|UPPER/i.test(type) || /capital/i.test(e.err_desc || "");
    const isGrammar = cat === "GRMR" || cat === "GRAMMAR" || /GRAMMAR/.test(type);
    const rep = e.replace || "";
    const WORD_RE = /^[A-Za-z]+(?:[-'’][A-Za-z]+)*$/;
    const isWordSwap = isGrammar && WORD_RE.test(rep) && rep.toLowerCase() !== (firstTokRaw || original).toLowerCase();

    if (cat === "SPELL") {
      tk.ui = "incorrect";
    } else if (isGrammar) {
      // Capitalization and clear word substitutions are treated as incorrect; other grammar stays advisory
      tk.ui = (isCapitalization || isWordSwap) ? "incorrect" : (tk.ui === "incorrect" ? "incorrect" : "possible");
      // Also mark any additional WORD tokens that fall within the edited span
      for (let j = firstTok + 1; j < tokens.length && tokens[j].start < e.end; j++) {
        if (isWord(tokens[j])) {
          const t2 = out[j];
          t2.ui = (isCapitalization || isWordSwap) ? "incorrect" : (t2.ui === "incorrect" ? "incorrect" : "possible");
        }
      }
    } else if (cat === "PUNC" && TERMS.has(rep)) {
      // punctuation is shown via carets/dots; do NOT mark previous word as 'possible'
      // (No-op for INSERT+PUNC)
    }
  }

  return out;
}

/** Build caret states from VT insertions derived from GB */
export type CaretState = "ghost" | "active";

/** Return N+1 carets, one for each boundary:
 *  [^] T0 [^] T1 [^] ... TN-1 [^]  (last ^ is end-of-text)
 */
export function buildCaretRow(tokens: Token[], insertions: VirtualTerminalInsertion[]) {
  const carets: CaretState[] = Array(tokens.length + 1).fill("ghost");

  for (const ins of insertions ?? []) {
    // beforeBIndex is a *boundary* index (0..N). If undefined, infer it.
    let b = typeof ins.beforeBIndex === "number" ? ins.beforeBIndex : -1;

    if (b < 0) {
      // Fallback: if we only have a character offset or token index,
      // put caret after the last token that ends at 'ins.at'
      // and map end-of-text to boundary N.
      if (typeof (ins as any).at === "number") {
        const off = (ins as any).at as number;
        const i = tokens.findIndex(t => t.end > off);
        b = i >= 0 ? i : tokens.length; // end-of-text insertion
      } else {
        b = tokens.length; // safest default = end boundary
      }
    }
    if (b >= 0 && b <= tokens.length) carets[b] = "active";
  }
  return carets;
}
