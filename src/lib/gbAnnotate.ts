import type { GbEdit } from "./gbClient";
import type { Token, VirtualTerminalInsertion } from "./types";

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
export type CaretState = "ghost" | "active";  // ghost = default faint caret, active = GB proposed terminal before this boundary

export function buildCaretRow(tokens: Token[], insertions: VirtualTerminalInsertion[]) {
  // One caret "before" each token boundary; default ghost
  const carets: CaretState[] = tokens.map(() => "ghost");

  for (const ins of insertions ?? []) {
    const idx = typeof ins.beforeBIndex === "number" ? ins.beforeBIndex : -1;
    if (idx >= 0 && idx < carets.length) carets[idx] = "active";
  }
  return carets;
}
