"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, ListChecks, Settings } from "lucide-react";
import type { Token as LibToken, VirtualTerminalInsertion } from "@/lib/types";
import { checkWithGrammarBot } from "@/lib/gbClient";
import { gbEditsToInsertions } from "@/lib/gbToVT";
import { annotateFromGb, buildCaretRow, groupInsertionsByBoundary, type CaretState, type DisplayToken as GbDisplayToken } from "@/lib/gbAnnotate";
import { gbToVtInsertions, withParagraphFallbackDots, newlineBoundarySet } from "@/lib/paragraphUtils";
import { tokenize } from "@/lib/tokenize";
import { cn, DEBUG, dgroup, dtable, dlog } from "@/lib/utils";
import { toCSV, download } from "@/lib/export";
import { Token, type TokenModel } from "@/components/Token";
import { bootstrapStatesFromGB, type TokState } from "@/lib/gb-map";
import { useTokensAndGroups } from "@/lib/useTokensAndGroups";
import { computeKpis } from "@/lib/computeKpis";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * CBM Writing & Spelling – TypeScript Web Tool (with dictionary packs + rule flags)
 *
 * Features:
 *  - Dictionary packs (demo bundles + custom lexicon) for WSC spell-checking
 *  - Automated CWS scoring with rule-based checks (capitalization, terminals)
 *  - Infraction flagging (definite vs possible) to speed teacher review
 *  - Spelling CLS scoring (unchanged), per-word breakdown and totals
 *
 * Notes (aligned to Wright, 1992; McMaster & Espin, 2007; Wright, 2013):
 *  - TWW: count words (misspellings included), exclude numerals
 *  - WSC: spelled-correct-in-isolation via dictionary packs + custom lexicon
 *  - CWS: adjacent unit pairs across words & essential punctuation; commas excluded; initial valid word yields 1
 *  - Terminal punctuation expected for sentences; capitalization expected after terminal
 */

// ———————————— Types & Constants ————————————

// keep these as plain string literals so Tailwind can see them (and we safelist them anyway)
const STATUS_CLS: Record<'ok'|'maybe'|'bad', string> = {
  ok:    'bg-green-50 text-green-800 ring-green-300',
  maybe: 'bg-amber-50 text-amber-800 ring-amber-300',
  bad:   'bg-red-50 text-red-800 ring-red-300',
};

function bubbleCls(status: 'ok'|'maybe'|'bad', selected: boolean) {
  return [
    'inline-flex items-center rounded-xl px-2 py-0.5 leading-6',
    'ring-1 ring-offset-1 ring-offset-white',  // or ring-offset-background
    STATUS_CLS[status],
    selected ? 'ring-2' : ''
  ].join(' ');
}

type UnitType = "word" | "numeral" | "comma" | "essentialPunct" | "other" | "PUNCT" | "WORD" | "HYPHEN";

type UIState = "correct" | "possible" | "incorrect";

  type UICell =
  | { kind: "token"; ti: number; ui: UIState }
  | { kind: "caret"; bi: number; ui: UIState };

type DisplayToken = LibToken & { virtual?: boolean; essential?: boolean; display?: string };

interface WordOverride { csw?: boolean }
interface PairOverride { cws?: boolean }
type PairOverrides = Record<number, { cws?: boolean }>; // key = bIndex (-1 or token index)

type Tri = "yellow" | "red" | "green";
const triFromOverride = (ov?: { cws?: boolean }): Tri =>
  ov?.cws === true ? "green" : ov?.cws === false ? "red" : "yellow";

const triForGroup = (group: any, pairOverrides: Record<number, { cws?: boolean }>): Tri => {
  const l = triFromOverride(pairOverrides[group.leftBoundaryBIndex]);
  const r = triFromOverride(pairOverrides[group.rightBoundaryBIndex]);
  // keep them in lock-step; if they ever diverge, show the "worst" (red > yellow > green)
  if (l === "red" || r === "red") return "red";
  if (l === "yellow" || r === "yellow") return "yellow";
  return "green";
};

interface Infraction {
  source: string;
  tag?: string;
  category: string;
  message: string;
  span: string;
  replace: string;
}

const WORD_RE = /^[A-Za-z]+(?:[-'’][A-Za-z]+)*$/;
const NUMERAL_RE = /^\d+(?:[\.,]\d+)*/;

// ———————————— Demo Dictionary Packs ————————————
// Tiny placeholder packs; in production, use GrammarBot for spell checking
const PACKS: Record<string, string[]> = {
  "us-k2": [
    "i","a","and","the","was","it","is","in","to","we","you","he","she","they","see","like","go","went","have","had",
    "dog","cat","tree","trees","house","boat","water","ocean","day","night","because"
  ],
  "us-k5": [
    "because","friend","before","after","first","next","then","finally","forest","terrible","nobody","could","would","should",
    "drink","fruit","gather","firewood","build","built","fix","spare","time","warm","dark"
  ],
  general: [
    "the","of","and","to","in","for","on","with","as","by","from","this","that","is","are","was","were","be","been","have","has","had",
    "like","people","student","students","school","story","write","writing","sequence","correct","letter","letters","because","friend",
    "talk","forest","terrible","nobody","could","would","drink","ocean","house","trees"
  ]
};

function buildLexicon(selected: string[], userLex: string): Set<string> {
  const set = new Set<string>();
  selected.forEach((p) => PACKS[p]?.forEach((w) => set.add(w.toLowerCase())));
  userLex
    .split(/;|,|\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .forEach((w) => set.add(w));
  return set;
}

// ———————————— Tokenization ————————————

// Complex tokenization functions removed - using simple tokenizer from lib

function sentenceBoundaries(text: string): { startIdx: number; endIdx: number; raw: string }[] {
  const parts = text.replace(/\n+/g, " ").split(/(?<=[\.!\?])\s+/).map((s) => s.trim()).filter(Boolean);
  const res: { startIdx: number; endIdx: number; raw: string }[] = [];
  let cursor = 0;
  parts.forEach((s) => {
    const start = text.indexOf(s, cursor);
    const end = start + s.length - 1;
    res.push({ startIdx: start, endIdx: end, raw: s });
    cursor = end + 1;
  });
  return res;
}

// (Spelling CLS module removed)


// Complex LT filtering removed - using simple filter from lib

function isTerminal(tok: LibToken) { return tok.type === "PUNCT" && /[.?!]/.test(tok.raw); }
function isWord(tok: LibToken)     { return tok.type === "WORD"; }
function isComma(tok: LibToken)    { return tok.type === "PUNCT" && tok.raw === ","; }
function isHyphen(tok: LibToken)   { return tok.type === "PUNCT" && tok.raw === "-"; }

// Complex helper functions removed - using LT-only approach

// ———————————— Writing: Spellcheck + CWS + Infractions ————————————

// Helper functions for KPI calculations
const isWordToken = (t: DisplayToken) => /^[A-Za-z][A-Za-z''-]*$/.test(t.raw) && !/^\d/.test(t.raw);
const isNumberToken = (t: DisplayToken) => /^\d+([.,]\d+)*$/.test(t.raw);

// SPELL error map: tokenIndex -> true
function spellErrorSetFromGB(gb: any, tokens: DisplayToken[]) {
  const set = new Set<number>();
  if (!gb || !gb.edits) return set;
  for (const e of gb.edits) {
    if (e.edit_type === "MODIFY" && e.err_cat === "SPELL") {
      const ti = charOffsetToTokenIndex(e.start, tokens);
      if (ti != null) set.add(ti);
    }
  }
  return set;
}

// boundaries that are sentence terminals (^ . ^, ^ ! ^, ^ ? ^)
function terminalBoundarySet(vtInsertions: VirtualTerminalInsertion[]) {
  const s = new Set<number>();
  for (const ins of vtInsertions) if (/[.!?]/.test(ins.char)) s.add(ins.beforeBIndex);
  return s;
}

// Helper to convert character offset to token index
function charOffsetToTokenIndex(charOffset: number, tokens: DisplayToken[]): number | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.start !== undefined && token.end !== undefined) {
      if (charOffset >= token.start && charOffset < token.end) {
        return i;
      }
    }
  }
  return null;
}

// TWW (Total Words Written; numerals excluded)
function calcTWW(tokens: DisplayToken[]) {
  return tokens.filter(t => isWordToken(t) && !isNumberToken(t)).length;
}

// WSC (Words Spelled Correctly)
function calcWSC(tokens: DisplayToken[], gb: any, tokenStates: Record<number, TokState>) {
  const spellErr = spellErrorSetFromGB(gb, tokens);
  let wsc = 0;
  tokens.forEach((t, i) => {
    if (isWordToken(t) && !isNumberToken(t)) {
      const currentState = tokenStates[i] ?? (spellErr.has(i) ? "bad" : "ok");
      if (currentState !== "bad") wsc++;
    }
  });
  return wsc;
}

// CWS (Correct Writing Sequences) & eligible boundaries
function capitalizationFixWordSet(gb: any, tokens: DisplayToken[]) {
  const set = new Set<number>();
  if (!gb || !gb.edits) return set;
  for (const e of gb.edits) {
    if (e.err_cat === "GRMR") {
      const ti = charOffsetToTokenIndex(e.start, tokens);
      if (ti != null) set.add(ti);
    }
  }
  return set;
}

function calcCWS(tokens: DisplayToken[], gb: any, vtInsertions: VirtualTerminalInsertion[], tokenStates: Record<number, TokState>, groupStates: Record<string, TokState>) {
  const spellErr = spellErrorSetFromGB(gb, tokens);
  const capFix   = capitalizationFixWordSet(gb, tokens);
  const terminals = terminalBoundarySet(vtInsertions);

  let eligible = 0;
  let cws = 0;

  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i+1];
    if (!isWordToken(a) || !isWordToken(b)) continue;           // words only
    // exclude commas (your rubric excludes commas)
    if (a.raw === "," || b.raw === ",") continue;

    eligible++;

    // after a terminal boundary, capitalization must be OK
    const boundaryIdx = i + 1;                        // caret index between a and b
    const startsSentence = terminals.has(boundaryIdx);
    const capitalOk = !startsSentence || !capFix.has(i+1);

    // Check current state overrides
    const aState = tokenStates[i] ?? (spellErr.has(i) ? "bad" : "ok");
    const bState = tokenStates[i+1] ?? (spellErr.has(i+1) ? "bad" : "ok");
    const spellOk = aState !== "bad" && bState !== "bad";

    if (spellOk && capitalOk) cws++;
  }

  return { cws, eligible };
}

// CWS/min (uses the timer mm:ss input)
function cwsPerMin(cws: number, mmss: string): number {
  const [mm, ss] = mmss.split(":").map(n=>parseInt(n,10) || 0);
  const minutes = Math.max(0.5, mm + ss/60); // guard tiny values
  return cws / minutes;
}

function computeTWW(tokens: LibToken[]): number {
  return tokens.filter((t) => t.type === "WORD").length;
}


// ———————————— UI Components ————————————

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-4xl font-semibold leading-none">{value}</div>
        {sub ? (
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SentenceList({ text }: { text: string }) {
  const sentences = useMemo(
    () => text.replace(/\n+/g, " ").split(/(?<=[\.!\?])\s+/).map((s) => s.trim()).filter(Boolean),
    [text]
  );
  return (
    <ol className="list-decimal ml-6 text-sm space-y-1">
      {sentences.map((s, i) => (<li key={i}>{s}</li>))}
    </ol>
  );
}

function InfractionList({ items }: { items: Infraction[] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground">No infractions flagged.</div>;

  const groups = useMemo(() => {
    const map = new Map<string, { count: number; tag: string; replace: string }>();
    for (const f of items) {
      const tag = (f.tag || f.category || "").toUpperCase();
      const rep = (f.replace || "").trim();
      const key = `${tag}|${rep}`;
      const prev = map.get(key);
      if (prev) prev.count += 1;
      else map.set(key, { count: 1, tag, replace: rep });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [items]);

  return (
    <div className="space-y-2">
      {groups.map((g, i) => (
        <div key={i} className="text-sm p-2 rounded-xl border border-amber-300 bg-amber-50">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            <span className="inline-flex items-center rounded bg-slate-200 px-2 py-0.5 text-xs font-medium">{g.count}×</span>
            <Badge variant="secondary">{g.tag}</Badge>
            {g.replace && <span className="text-xs text-muted-foreground">→ {g.replace}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// TerminalSuggestions component removed - using LT-only approach

function WritingScorer() {
  const [text, setText] = useState<string>(
    "yesterday me and my freind go to the park we was runned fast but the dog chased us and it dont stop we yell nobody hear us the grass are green the skye blue we decide climb the tree but the branch breaked my shoes was muddy my shirt have hole’s. I think i gonna climb again but then and then and then we fall.\n\nLater the teacher sayed you should of stay home insted of playing in rain. “be careful kids” she tell us and we dont listen we was to busy running their in the feild I thinked maybe we is lost. My friend smile and say its okay we gonna find are way home eventually at 5 pm but i writed 5:00 instead. I also got 1nd place in the race, lol, but my sister-inlaw laughed."
  );
  const [overrides, setOverrides] = useState<Record<string | number, WordOverride | PairOverride>>({});
  const [pairOverrides, setPairOverrides] = useState<PairOverrides>({});
  // Always-on flags (since the toggle is gone)
  const showInfractions = true;
  
  // New state management using hooks
  const { tokens: tokenModels, setTokens: setTokenModels } = useTokensAndGroups() as any;
  const [selected, setSelected] = useState<{type:"token"; id:number|string} | null>(null);

  // Drag & drop discard + undo
  const [draggingToken, setDraggingToken] = useState<number | null>(null);
  const [draggingCaret, setDraggingCaret] = useState<number | null>(null);
  const [overDiscard, setOverDiscard] = useState(false);
  type UndoAction =
    | { type: 'remove-token'; index: number }
    | { type: 'remove-caret'; index: number }
    | { type: 'remove-group'; id: string };
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  // click routing from a cell
  function onCellActivate(c: UICell) {
    if (c.kind === "token") {
      onTokenClick(c.ti);
      setSelected({ type: "token", id: c.ti });
    } else if (c.kind === 'caret') {
      toggleCaret(c.bi);
    }
  }

  // Helper function to cycle through statuses
  const cycle = (s: 'ok'|'maybe'|'bad'): 'ok'|'maybe'|'bad' =>
    s === 'ok' ? 'maybe' : s === 'maybe' ? 'bad' : 'ok';

  // Click handlers for tokens
  const onTokenClick = (idx: number) => {
    setUi(prev => {
      const tokens = prev.tokens.slice();
      const t = tokens[idx];
      let next: 'ok'|'maybe'|'bad' = 'ok';
      if (t) {
        next = t.state === 'ok' ? 'maybe' : (t.state === 'maybe' ? 'bad' : 'ok');
        tokens[idx] = { ...t, state: next } as any;
      }
      // Synchronize adjacent carets (idx and idx+1) to the word's new state
      const nextStates = { ...prev.caretStates } as Record<number, 'ok'|'maybe'|'bad'>;
      nextStates[idx] = next;
      nextStates[idx + 1] = next;
      const nextManual = new Set(prev.manualCaretOverrides);
      nextManual.add(idx);
      nextManual.add(idx + 1);
      const kpis = computeKpis(tokens, prev.minutes, nextStates);
      return { ...prev, tokens, caretStates: nextStates, manualCaretOverrides: nextManual, kpis };
    });
  };

  // Cycle helper for caret state
  const cycleState = (s: 'ok'|'maybe'|'bad'): 'ok'|'maybe'|'bad' => (s === 'ok' ? 'maybe' : s === 'maybe' ? 'bad' : 'ok');

  // Toggle a single caret by boundary index
  const toggleCaret = (bi: number) => {
    setUi(prev => {
      const nextStates = { ...prev.caretStates } as Record<number, 'ok'|'maybe'|'bad'>;
      const cur = nextStates[bi] ?? 'ok';
      nextStates[bi] = cycleState(cur);
      const nextManual = new Set(prev.manualCaretOverrides);
      nextManual.add(bi);
      return {
        ...prev,
        caretStates: nextStates,
        manualCaretOverrides: nextManual,
        kpis: computeKpis(prev.tokens, prev.minutes, nextStates),
      };
    });
  };

  // Remove a caret by boundary index (hide it and make it non-blocking)
  const removeCaretByIndex = useCallback((bi: number) => {
    setUi(prev => {
      const nextStates = { ...prev.caretStates } as Record<number, 'ok'|'maybe'|'bad'>;
      nextStates[bi] = 'ok'; // ensure it doesn't block CWS
      const removed = new Set(prev.removedCarets ?? new Set<number>());
      removed.add(bi);
      return { ...prev, caretStates: nextStates, removedCarets: removed, kpis: computeKpis(prev.tokens, prev.minutes, nextStates) };
    });
    setUndoStack(prev => [...prev, { type: 'remove-caret', index: bi }]);
  }, []);

  // Remove a token by index (mark as removed, keep indices stable)
  const removeTokenByIndex = useCallback((idx: number) => {
    setUi(prev => {
      const tokens = prev.tokens.slice();
      if (tokens[idx]) tokens[idx] = { ...tokens[idx], removed: true } as any;
      return { ...prev, tokens, kpis: computeKpis(tokens, prev.minutes, prev.caretStates) };
    });
    setUndoStack(prev => [...prev, { type: 'remove-token', index: idx }]);
  }, []);

  // Undo last action (supports token and caret removal)
  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      const next = prev.slice();
      const action = next.pop();
      if (!action) return prev;
      if (action.type === 'remove-token') {
        setUi(prevUi => {
          const tokens = prevUi.tokens.slice();
          if (tokens[action.index]) tokens[action.index] = { ...tokens[action.index], removed: false } as any;
          return { ...prevUi, tokens, kpis: computeKpis(tokens, prevUi.minutes, prevUi.caretStates) };
        });
      } else if (action.type === 'remove-caret') {
        setUi(prevUi => {
          const removed = new Set(prevUi.removedCarets);
          removed.delete(action.index);
          return { ...prevUi, removedCarets: removed, kpis: computeKpis(prevUi.tokens, prevUi.minutes, prevUi.caretStates) };
        });
      }
      return next;
    });
  }, []);

  // Keyboard: Cmd/Ctrl+Z to undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo]);

  // Render helpers
  const isSel = (t:"token", id:number|string) => selected?.type===t && selected.id===id;

  function clsForCell(c: UICell) {
    if (c.kind === "token") {
      const token = ui.tokens[c.ti];
      const state = token?.state ?? "ok";
      const selected = isSel("token", c.ti);
      return bubbleCls(state, selected);
    }
    if (c.kind === "caret") {
      const state = ui.caretStates[c.bi] ?? (c.ui === 'incorrect' ? 'bad' : c.ui === 'possible' ? 'maybe' : 'ok');
      const selected = focus?.type === 'caret' && focus.index === c.bi;
      return bubbleCls(state, selected);
    }
    return "";
  }

  // accessibility + click
  // Build simple tooltip text from GB hits
  function tooltipForToken(i: number): string | undefined {
    const t = displayTokens[i] as any;
    const hits = (t?.gbHits ?? []) as Array<{ start:number; end:number; replace?:string; err_cat?:string; err_type?:string; err_desc?:string; edit_type?:string }>;
    if (!hits.length) return undefined;
    const labels: string[] = [];
    for (const e of hits) {
      const cat = (e.err_cat || "").toUpperCase();
      const rep = e.replace || "";
      const original = text.slice(e.start, e.end);
      const isCap = !!(rep && original && rep.toLowerCase() === original.toLowerCase() && rep !== original);
      if (cat === 'SPELL') {
        labels.push(`Spelling → ${rep}`);
      } else if (cat === 'GRMR') {
        if (isCap) labels.push('Capitalization');
        else if (/n't|’t/.test(rep)) labels.push(`Contraction → ${rep}`);
        else if (/\b(was|were|is|are|has|have|do|does|did|go|went|run|running)\b/i.test(rep)) labels.push(`Grammar → ${rep}`);
        else labels.push('Grammar');
      } else if (cat === 'PUNC' && /[.!?]/.test(rep)) {
        labels.push(`Add terminal: ${rep}`);
      } else if (cat) {
        labels.push(cat);
      }
    }
    // de-dupe while preserving order
    const seen = new Set<string>();
    const uniq = labels.filter(l => (seen.has(l) ? false : (seen.add(l), true)));
    return uniq.join('; ');
  }

  function tipForCaret(bi: number): string | undefined {
    const list = insertionMap.get(bi) ?? [];
    if (!list.length) return undefined;
    const chars = Array.from(new Set(list.map(i => i.char))).join(', ');
    return `Missing terminal: ${chars}`;
  }

  function cellEl(c: UICell, key: React.Key) {
    const role = "button";
    const tabIndex = role ? 0 : -1;
    const draggable = c.kind === 'token' || c.kind === 'caret';
    return (
      <button
        type="button"
        key={key}
        role={role}
        tabIndex={tabIndex}
        onClick={() => onCellActivate(c)}
        onKeyDown={(e)=>{ if (role && (e.key==="Enter"||e.key===" ")) { e.preventDefault(); onCellActivate(c); }}}
        draggable={draggable}
        onDragStart={draggable ? (e) => {
          try {
            if (c.kind === 'token') {
              e.dataTransfer.setData('text/plain', `token:${(c as any).ti}`);
              setDraggingToken((c as any).ti);
            } else if (c.kind === 'caret') {
              e.dataTransfer.setData('text/plain', `caret:${(c as any).bi}`);
              setDraggingCaret((c as any).bi);
            }
          } catch {}
          e.dataTransfer.effectAllowed = 'move';
        } : undefined}
        onDragEnd={draggable ? () => { setDraggingToken(null); setDraggingCaret(null); setOverDiscard(false); } : undefined}
        className={clsForCell(c) + ' tt cursor-pointer'}
        data-tip={
          c.kind === 'token' ? (tooltipForToken((c as any).ti) || undefined)
          : tipForCaret((c as any).bi)
        }
        aria-pressed={
          c.kind === 'token'
            ? isSel('token', (c as any).ti)
            : (focus?.type === 'caret' && focus.index === (c as any).bi) || undefined
        }
      >
        {/* token text or caret glyph */}
        {c.kind==="caret" ? "^" : displayTokens[c.ti].overlay ?? displayTokens[c.ti].raw}
      </button>
    );
  }

  // Focus state for clickable elements
  const [focus, setFocus] = useState<{type:"caret"|"token"; index:number} | null>(null);

  // Click and keyboard handlers
  const onCaretClick = (i: number) => setFocus({ type: "caret", index: i });
  const onTokenClickFocus = (i: number) => setFocus({ type: "token", index: i });
  // no insert cells anymore

  const onKey = (e: React.KeyboardEvent, type: "caret" | "token", i: number) => {
    if (e.key === "Enter" || e.key === " ") { 
      e.preventDefault(); 
      setFocus({ type, index: i }); 
    }
    if (e.key === "ArrowLeft" && focus) {
      setFocus({ ...focus, index: Math.max(0, focus.index - 1) });
    }
    if (e.key === "ArrowRight" && focus) {
      const max = type === "caret" ? displayTokens.length : displayTokens.length - 1;
      setFocus({ ...focus, index: Math.min(max, focus.index + 1) });
    }
  };

  // If code referenced custom lexicon, freeze it empty:
  const customLexicon = useMemo(() => new Set<string>(), []);

  // If code referenced user-chosen dictionary packs, freeze to auto/default behavior.
  const selectedPacks: string[] = useMemo(() => ["us-k2","us-k5","general"], []);
  

  const [gb, setGb] = useState<{edits: any[], correction?: string} | null>(null);
  const [showCaps, setShowCaps] = useState(true);
  
  // GrammarBot settings state
  const [showSettings, setShowSettings] = useState(false);
  const [showCapitalizationFixes, setShowCapitalizationFixes] = useState(true);
  const lastCheckedText = useRef<string>("");    // to avoid duplicate checks
  const grammarRunId = useRef<number>(0);        // cancellation token for in-flight checks

  // Simple grammar mode label
  const grammarModeLabel = "GB-only";

  // --- Time for probe (mm:ss) ---
  const [timeMMSS, setTimeMMSS] = useState("03:00"); // default 3 min
  function parseMMSS(s: string) {
    const m = s.trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!m) return 0;
    const mins = parseInt(m[1], 10), secs = parseInt(m[2], 10);
    return mins * 60 + secs;
  }
  const durationSec = useMemo(() => parseMMSS(timeMMSS), [timeMMSS]);
  const durationMin = durationSec ? durationSec / 60 : 0;

  // Single UI state object with KPIs
  // caretBad is derived from VT insertions; initialize empty set
  const [ui, setUi] = useState({
    tokens: tokenModels,
    minutes: durationMin,
    caretStates: {} as Record<number, 'ok'|'maybe'|'bad'>,
    manualCaretOverrides: new Set<number>() as Set<number>,
    removedCarets: new Set<number>() as Set<number>,
    kpis: computeKpis(tokenModels, durationMin, {})
  });

  // Update UI state when tokenModels or terminalGroups change
  useEffect(() => {
    setUi(prev => ({
      ...prev,
      tokens: tokenModels,
      minutes: durationMin,
      kpis: computeKpis(tokenModels, durationMin, prev.caretStates)
    }));
  }, [tokenModels, durationMin]);

// Complex functions removed - using LT-only approach

  // Complex WSC/CWS computation removed - using LT-only approach

  const lexicon = useMemo(() => buildLexicon(selectedPacks, ""), [selectedPacks]);
  
  const tokens = useMemo<LibToken[]>(() => tokenize(text), [text]);


  useEffect(() => {
    let alive = true;
    (async () => {
      const resp = await checkWithGrammarBot(text);
      if (alive) {
        setGb(resp);
        // Initialize token models and terminal groups from GB data
        const gbEdits = resp?.edits ?? [];
        const { tokenModels: newTokenModels } = bootstrapStatesFromGB(text, tokens, gbEdits) as any;
        setTokenModels(newTokenModels);
      }
    })();
    return () => { alive = false; };
  }, [text, tokens, setTokenModels]);

  const terminalInsertions = useMemo<VirtualTerminalInsertion[]>(() => {
    const edits = gb?.edits ?? [];
    const ins = gbEditsToInsertions(text, tokens, edits);
    if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) console.info("[VT] counts", { gb: ins.length, insertions: ins.length });
    return ins;
  }, [text, tokens, gb]);

  // Punctuation insertions from GB with paragraph fallback
  const vtInsertions = useMemo(() => {
    let inserts = gbToVtInsertions(gb ?? { edits: [] }, text, tokens);
    inserts = withParagraphFallbackDots(inserts, text, tokens);
    if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
      console.info("[VT] boundaries", inserts.map(i => ({ b: i.beforeBIndex, ch: i.char, at: i.at })));
    }
    return inserts;
  }, [text, tokens, gb]);

  // Highlights + carets
  const displayTokens = useMemo(
    () => annotateFromGb(text, tokens, gb?.edits ?? [], { showCaps }),
    [text, tokens, gb, showCaps]
  );

  const caretRow = useMemo(() => buildCaretRow(tokens, vtInsertions), [tokens, vtInsertions]);
  // Detect GrammarBot availability/error from client response
  const gbError: string | null = useMemo(() => {
    const anyGb = gb as any;
    if (!anyGb) return null;
    if (typeof anyGb.status === 'number' && anyGb.status >= 400) {
      return anyGb.error || `GrammarBot error (${anyGb.status})`;
    }
    if (!Array.isArray(anyGb.edits)) return 'GrammarBot unavailable (no edits)';
    return null;
  }, [gb]);

  // Group ID assignment for terminal groups
  const insertionMap = useMemo(
    () => groupInsertionsByBoundary(vtInsertions /* GB→VT array */),
    [vtInsertions]
  );

  // Initialize/update caret states from VT insertions and word errors, preserving manual overrides
  useEffect(() => {
    const N = displayTokens.length;
    const defaults: Record<number, 'ok'|'maybe'|'bad'> = {};
    for (let b = 0; b <= N; b++) defaults[b] = 'ok';
    // 1) Missing punctuation proposals → bad at that boundary
    for (const ins of vtInsertions) defaults[ins.beforeBIndex] = 'bad';
    // 2) Words marked bad → mark both adjacent carets bad (initial visual parity)
    for (let i = 0; i < ui.tokens.length; i++) {
      const tm = ui.tokens[i] as any;
      if (tm && tm.kind === 'word' && !tm.removed && tm.state === 'bad') {
        defaults[i] = 'bad';
        defaults[i + 1] = 'bad';
      }
    }

    setUi(prev => {
      const nextStates: Record<number, 'ok'|'maybe'|'bad'> = { ...defaults };
      // keep manual overrides intact when present
      for (const bi of prev.manualCaretOverrides) {
        if (prev.caretStates[bi] != null) nextStates[bi] = prev.caretStates[bi];
      }
      return {
        ...prev,
        caretStates: nextStates,
        kpis: computeKpis(prev.tokens, prev.minutes, nextStates)
      };
    });
  }, [vtInsertions, displayTokens.length, ui.tokens]);

  // Build final output text from GrammarBot's full correction
  const finalOutputText = useMemo(() => {
    // Prefer `correction` from GrammarBot when available
    if (gb?.correction && typeof gb.correction === 'string') return gb.correction;

    // Fallback: apply edits to original text (reverse order to preserve offsets)
    if (Array.isArray(gb?.edits)) {
      let out = text;
      const edits = [...(gb?.edits ?? [])].sort((a, b) => b.start - a.start);
      for (const e of edits) {
        const rep = (e.replace ?? '');
        out = out.slice(0, e.start) + rep + out.slice(e.end);
      }
      return out;
    }

    // No GB data – show original text
    return text;
  }, [text, gb]);

  const gridCells: UICell[] = useMemo(() => {
    const cells: UICell[] = [];
    const N = displayTokens.length;
    // caret severity from state: map ok/maybe/bad to correct/possible/incorrect for UI

    for (let b = 0; b <= N; b++) {
      // 1) caret at boundary b (skip if removed)
      if (!ui.removedCarets?.has(b)) {
        const cState = ui.caretStates[b] ?? 'ok';
        const sev: 'correct'|'possible'|'incorrect' = cState === 'bad' ? 'incorrect' : cState === 'maybe' ? 'possible' : 'correct';
        cells.push({ kind: 'caret', bi: b, ui: sev });
      }

      // 3) token after boundary b (for b < N)
      if (b < N) {
        const removed = !!ui.tokens[b]?.removed;
        if (!removed) {
          const t = displayTokens[b];
          cells.push({ 
            kind: "token", 
            ti: b, 
            ui: t.ui 
          });
        }
      }
    }
    return cells;
  }, [displayTokens, caretRow, insertionMap, ui.tokens, ui.caretStates, ui.removedCarets]);

  // Split grid cells into paragraph blocks
  const paragraphBlocks: UICell[][] = useMemo(() => {
    const nlBoundaries = newlineBoundarySet(text, displayTokens);
    const blocks: UICell[][] = [];
    let currentBlock: UICell[] = [];

    for (const cell of gridCells) {
      // Split when we encounter the FIRST token of a new paragraph, not the newline caret.
      if (cell.kind === 'token' && nlBoundaries.has((cell as any).ti)) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [];
        }
      }
      currentBlock.push(cell);
    }

    if (currentBlock.length > 0) blocks.push(currentBlock);
    return blocks;
  }, [gridCells, text, displayTokens]);

  if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
    console.info("[UI] tokens", displayTokens);
    console.info("[UI] carets", caretRow);
  }

  // Use computed KPIs from UI state
  const kpis = ui.kpis;

  // Simplified CWS pairs (placeholder for now)
  const cwsPairs = useMemo(() => [], []);

  // Simplified metrics (placeholder for now)
  const audit = useMemo(() => [], []);
  const iws = 0;
  const ciws = 0;

  // Infractions list (pure GB)
  const infractions = useMemo(() =>
    (gb?.edits ?? []).map(e => ({
      source: "GB",
      tag: (e.err_cat || e.edit_type || "").toUpperCase(),
      category: e.err_cat ?? e.edit_type,
      message: e.err_desc ?? "",
      span: text.slice(e.start, e.end),
      replace: e.replace,
    })), [gb, text]);

  // Debug: assert parity between GB edits and correction
  useEffect(() => {
    if (gb?.edits && gb?.correction && DEBUG) {
      try {
        let reconstructed = text;
        // Apply edits in reverse order to maintain correct offsets
        const sortedEdits = [...gb.edits].sort((a, b) => b.start - a.start);
        for (const edit of sortedEdits) {
          const before = reconstructed.slice(0, edit.start);
          const after = reconstructed.slice(edit.end);
          reconstructed = before + edit.replace + after;
        }
        
        if (reconstructed !== gb.correction) {
          console.warn("[GB] Parity check failed:", {
            original: text,
            reconstructed,
            expected: gb.correction,
            edits: gb.edits
          });
        } else {
          console.info("[GB] Parity check passed ✓");
        }
      } catch (error) {
        console.error("[GB] Parity check error:", error);
      }
    }
  }, [gb, text]);


  // Export functions
  const exportCSV = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    download(`cbm-audit-${timestamp}.csv`, toCSV(audit));
  };

  const exportPDF = async () => {
    const el = document.getElementById("report-pane");
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2 });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    pdf.addImage(img, "PNG", 0, 0, canvas.width * ratio, canvas.height * ratio);
    pdf.save("cbm-report.pdf");
  };

  // Clear session data function
  const handleClearSessionData = () => {
    if (confirm("Clear all session data? This will reset settings and clear the text area.")) {
      setText(""); // Clear the textarea
      setGb(null); // Clear grammar issues
    }
  };

  return (
    <Card>
      <CardContent>
        {/* Discard area overlay on the right side */}
        <div
          className={cn(
            'fixed top-1/2 -translate-y-1/2 z-30 h-[60vh] min-h-64 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors select-none',
            overDiscard ? 'bg-rose-50 border-rose-400 text-rose-700 shadow-lg' : 'bg-slate-50/80 border-slate-300 text-slate-600'
          )}
          style={{ left: 'var(--discard-x)', width: 'var(--discard-w)' }}
          onDragOver={(e) => { e.preventDefault(); (e.dataTransfer as DataTransfer).dropEffect = 'move'; setOverDiscard(true); }}
          onDragEnter={(e) => { e.preventDefault(); setOverDiscard(true); }}
          onDragLeave={() => { setOverDiscard(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setOverDiscard(false);
            let data = '';
            try { data = (e.dataTransfer as DataTransfer).getData('text/plain'); } catch {}
            if (data.startsWith('token:')) {
              const idxStr = data.slice('token:'.length);
              const idx = Number.isFinite(+idxStr) ? parseInt(idxStr, 10) : (draggingToken ?? -1);
              if (Number.isFinite(idx) && idx >= 0) removeTokenByIndex(idx);
              return;
            }
            if (data.startsWith('caret:')) {
              const biStr = data.slice('caret:'.length);
              const bi = Number.isFinite(+biStr) ? parseInt(biStr, 10) : (draggingCaret ?? -1);
              if (Number.isFinite(bi) && bi >= 0) removeCaretByIndex(bi);
              return;
            }
            // Fallbacks when dataTransfer is blocked
            if (draggingToken != null && draggingToken >= 0) {
              removeTokenByIndex(draggingToken);
            } else if (draggingCaret != null && draggingCaret >= 0) {
              removeCaretByIndex(draggingCaret);
            }
          }}
          aria-label="Discard Area"
        >
          <div className="text-sm font-medium">Discard</div>
        </div>

        {/* Undo button */}
        {undoStack.length > 0 && (
          <button
            className="fixed right-4 bottom-4 z-30 px-3 py-1.5 rounded-md bg-slate-800 text-white text-sm shadow hover:bg-slate-700"
            onClick={handleUndo}
            aria-label="Undo last action (Cmd/Ctrl+Z)"
            title="Undo (Cmd/Ctrl+Z)"
          >
            Undo
          </button>
        )}
        {/* Page body */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT: Textbox + controls + legend + stream */}
          <div className="space-y-3">
            {/* Student writing textarea */}
            <div>
              <label className="text-sm font-medium">Paste student writing</label>
              <Textarea className="min-h-[160px] mt-1" value={text} onChange={(e) => setText(e.target.value)} />
            </div>

            {gbError && (
              <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900">
                GrammarBot unavailable: {gbError}. Set GRAMMARBOT_API_KEY in .env.local and restart the dev server.
              </div>
            )}

            {/* Single-line controls: time + color key */}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Time (mm:ss)</span>
                <input
                  value={timeMMSS}
                  onChange={(e) => setTimeMMSS(e.target.value)}
                  className="h-8 w-20 rounded border px-2 text-sm"
                  placeholder="mm:ss"
                  aria-label="Probe time in minutes and seconds"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-emerald-200 border border-emerald-300" />
                  correct
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-red-200 border border-red-300" />
                  incorrect
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-amber-200 border border-amber-300" />
                  possible
                </span>
              </div>
            </div>

            {/* Token display with interleaved carets - split into paragraphs */}
            <div className="cbm-paragraphs mt-3 p-3 rounded-2xl bg-muted/40">
              {paragraphBlocks.map((block, pIdx) => (
                <div key={pIdx} className="cbm-paragraph mb-4 last:mb-0">
                  {block.map((c, idx) => cellEl(c, `${c.kind}-${pIdx}-${idx}`))}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Metrics grid (2 rows × 3 cards) + infractions */}
          <div id="report-pane" className="space-y-4">
            {/* Export buttons */}
            <div className="flex gap-2">
              <button
                onClick={exportCSV}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={exportPDF}
                className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >
                Export PDF
              </button>
            </div>
            {/* Metrics grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="Total Words Written"
                value={kpis.tww}
                sub="numerals excluded"
              />
              <StatCard
                title="Words Spelled Correctly"
                value={kpis.wsc}
                sub="dictionary + overrides"
              />
              <StatCard
                title="Correct Writing Sequences"
                value={kpis.cws}
                sub="adjacent-unit pairs"
              />

              <StatCard
                title="% CWS"
                value={<>{kpis.pctCws}<span className="text-2xl">%</span></>}
                sub={`${kpis.cws}/${kpis.eligible} eligible boundaries`}
              />
              <StatCard
                title="CIWS"
                value={ciws}
                sub={`CWS − IWS (IWS=${iws})`}
              />
              <StatCard
                title="CWS / min"
                value={kpis.cwsPerMin === null ? "—" : (Math.round(kpis.cwsPerMin * 10) / 10).toFixed(1)}
                sub={durationSec ? `${timeMMSS} timed` : "enter time"}
              />
            </div>

            {/* Output text with removed tokens (no auto-inserted punctuation) */}
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-sm font-medium text-blue-800 mb-1">Output Text</div>
              <div className="text-sm text-blue-700 whitespace-pre-wrap break-words">{finalOutputText}</div>
            </div>

            {/* Infractions & Suggestions list — always visible now */}
            <div>
              <div className="mb-2 text-sm font-medium">Infractions &amp; Suggestions</div>
              <InfractionList items={infractions} />
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          <p className="font-medium">Scoring guidance</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>TWW</strong>: all words written; include misspellings; exclude numerals.</li>
            <li><strong>WSC</strong>: each correctly spelled word in isolation (override by clicking). Uses GrammarBot for spell checking; otherwise, a custom-lexicon fallback is used.</li>
            <li><strong>CWS</strong>: adjacent units (words & essential punctuation). Commas excluded. Initial valid word counts 1. Capitalize after terminals.</li>
          </ul>
        </div>

        {/* Privacy Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Privacy:</span>
              <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                GrammarBot cloud service (API key required)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearSessionData}
                className="text-red-600 hover:text-red-800 underline"
              >
                Clear session data
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// SpellingScorer removed

export default function CBMApp(): JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      {/* Widen the main container on large/2xl screens while remaining fluid on small screens */}
      <div className="mx-auto w-full max-w-screen-xl 2xl:max-w-screen-2xl with-discard-pad">
        <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl md:text-3xl font-bold">
          Written Expression (TWW, WSC, CWS) – with Flags
        </motion.h1>

        <div className="mt-4">
          <WritingScorer />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Implementation Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm list-disc ml-5 space-y-1">
              <li><strong>Dictionary packs</strong>: demo packs included; swap in real dictionaries or WASM spellcheckers for production.</li>
              <li><strong>Capitalization & terminals</strong>: heuristic checks flag definite/possible issues for quick review.</li>
              <li><strong>Overrides</strong>: click words to toggle WSC; word clicks also synchronize the two adjacent carets to match the word. Click a caret to cycle that boundary independently.</li>
              <li><strong>Extensibility</strong>: uses GrammarBot for spell checking; add POS-based rules if desired.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
