import type { GbEdit } from "./gbClient";
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
  gbHits?: GbEdit[];       // edits intersecting this token
};

const TERMS = new Set([".", "!", "?"]);
const isWord = (t: Token) => /\w/.test(t.raw?.[0] ?? "");

export function annotateFromGb(
  text: string,
  tokens: Token[],
  edits: GbEdit[],
  opts?: { showCaps?: boolean }
): DisplayToken[] {
  const out: DisplayToken[] = tokens.map(t => ({ ...t, ui: "correct" as UiState, gbHits: [] }));

  for (const e of edits ?? []) {
    // 1) Attach edits to overlapping tokens
    let firstTok = tokens.findIndex(t => e.end > t.start && e.start < t.end);
    if (firstTok === -1) {
      // If it's a pure insertion at a boundary (e.g., period), attach to the previous word
      firstTok = tokens.findIndex(t => t.start >= e.end);
      firstTok = firstTok > 0 ? firstTok - 1 : tokens.length - 1;
    }

    if (firstTok < 0 || firstTok >= tokens.length) continue;
    const tk = out[firstTok];
    tk.gbHits!.push(e);

    // 2) Decide UI severity and optional overlay
    const cat = (e.err_cat || "").toUpperCase();
    const rep = e.replace || "";

    if (cat === "SPELL") {
      tk.ui = "incorrect";
    } else if (cat === "GRMR") {
      // Capitalization like "Nobody": only overlay if enabled
      if (opts?.showCaps && /^[A-Z]/.test(rep) && rep.toLowerCase() === text.slice(e.start, e.end).toLowerCase()) {
        tk.overlay = rep;        // visual only, source text unchanged
      }
      tk.ui = tk.ui === "incorrect" ? "incorrect" : "possible";
    } else if (cat === "PUNC" && TERMS.has(rep)) {
      // punctuation is shown via carets/dots; mark previous word as 'possible'
      if (tk.ui !== "incorrect") tk.ui = "possible";
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
