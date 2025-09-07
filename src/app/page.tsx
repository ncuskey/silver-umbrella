"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, ListChecks, Settings } from "lucide-react";
import type { GrammarIssue, Token } from "@/lib/spell/types";
import { buildCwsPairs, ESSENTIAL_PUNCT } from "@/lib/cws";
import type { CwsPair } from "@/lib/cws";
import { buildLtCwsHints, convertLTTerminalsToInsertions, buildTerminalGroups, ltBoundaryInsertions, isCommaOnlyForCWS, type TerminalGroup } from "@/lib/cws-lt";
import type { CwsHint } from "@/lib/cws-lt";
import { detectMissingTerminalInsertionsSmart, detectParagraphEndInsertions, VirtualTerminalInsertion, createVirtualTerminals, createVirtualTerminalsFromDisplay, VirtualTerminal } from "@/lib/cws-heuristics";
import { cn, DEBUG, dgroup, dtable, dlog } from "@/lib/utils";
import { toCSV, download } from "@/lib/export";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { getLtBase, getLtPrivacy, clearSessionData, overlaps, summarizeLT as ltSummarizeLT } from "@/lib/grammar/languagetool-client";

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

type UnitType = "word" | "numeral" | "comma" | "essentialPunct" | "other" | "PUNCT" | "WORD" | "HYPHEN";


type DisplayToken = Token & { virtual?: boolean; essential?: boolean; display?: string };

interface WordOverride { csw?: boolean }
interface PairOverride { cws?: boolean }
type PairOverrides = Record<number, { cws?: boolean }>; // key = bIndex (-1 or token index)

type Tri = "yellow" | "red" | "green";
const triFromOverride = (ov?: { cws?: boolean }): Tri =>
  ov?.cws === true ? "green" : ov?.cws === false ? "red" : "yellow";

const triForGroup = (group: VirtualTerminal, pairOverrides: Record<number, { cws?: boolean }>): Tri => {
  const l = triFromOverride(pairOverrides[group.leftBoundaryBIndex]);
  const r = triFromOverride(pairOverrides[group.rightBoundaryBIndex]);
  // keep them in lock-step; if they ever diverge, show the "worst" (red > yellow > green)
  if (l === "red" || r === "red") return "red";
  if (l === "yellow" || r === "yellow") return "yellow";
  return "green";
};

interface Infraction {
  kind: "definite" | "possible";
  tag: string; // e.g., SPELLING, CAPITALIZATION, TERMINAL, PAIR
  msg: string;
  at: number | string; // token idx or pair key
}

const WORD_RE = /^[A-Za-z]+(?:[-'’][A-Za-z]+)*$/;
const NUMERAL_RE = /^\d+(?:[\.,]\d+)*/;

// ———————————— Demo Dictionary Packs ————————————
// Tiny placeholder packs; in production, use LanguageTool for spell checking
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

const TOKEN_RE = /[A-Za-z]+(?:[-''][A-Za-z]+)*|[\.!\?;:\u2014\u2013\-]|,|\d+(?:[\.,]\d+)*/g;

/**
 * Tokenize text with proper character offsets to fix WSC
 * This preserves spans in the original, unmodified text (no trim, no normalization)
 */
function tokenizeWithOffsets(text: string): Token[] {
  const out: Token[] = [];
  let idx = 0;
  // words vs single non-space punctuation; preserves newlines & spaces in offsets
  const re = /\w+|[^\s\w]/g;
  for (const m of text.matchAll(re)) {
    const start = m.index!;
    const end = start + m[0].length;
    out.push({
      idx,
      raw: m[0],
      type: /\w/.test(m[0][0]) ? "WORD" : "PUNCT",
      start,
      end
    });
    idx++;
  }
  return out;
}

function tokenize(text: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const start = m.index ?? i;
    const end = start + raw.length;

    let type: "WORD" | "PUNCT";
    if (/^\d/.test(raw)) type = "PUNCT";        // numbers as punctuation for now
    else if (/^[,]$/.test(raw)) type = "PUNCT";        // non-essential for CWS
    else if (/^[\.!\?;:]$/.test(raw)) type = "PUNCT";  // essential for CWS
    else if (/^-+$/.test(raw)) type = "PUNCT";         // hyphens
    else type = "WORD";

    toks.push({ raw, type, idx: toks.length, start, end });
    i = end;
  }
  return toks;
}

function insertVirtualTerminals(base: Token[], inserts: VirtualTerminalInsertion[]): DisplayToken[] {
  const out: DisplayToken[] = base.map(t => ({ ...t }));
  const sorted = [...inserts].sort((a, b) => b.beforeBIndex - a.beforeBIndex);
  for (const ins of sorted) {
    const at = ins.beforeBIndex + 1;
    dlog("[VT] insert", { at, char: ins.char, beforeBIndex: ins.beforeBIndex });
    out.splice(at, 0, {
      raw: ins.char,
      type: "PUNCT",
      essential: true,
      virtual: true,
      display: ins.char,
      idx: -1,
    } as DisplayToken);
  }
  DEBUG && dgroup("[VT] displayTokens after insert", () => {
    dtable("displayTokens", out.map((t, i) => ({
      i, raw: t.raw, type: t.type, idx: (t as any).idx, virtual: (t as any).virtual
    })));
  });
  return out;
}

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

// ———————————— Spelling: Correct Letter Sequences (CLS) ————————————

function clsForWord(target: string, attempt: string): { cls: number; max: number; correctWhole: boolean } {
  const t = target.trim();
  const a = attempt.trim();
  const max = Math.max(t.length + 1, 1);
  let cls = 0;
  if (a[0] && a[0].toLowerCase() === t[0]?.toLowerCase()) cls++;
  for (let i = 0; i < t.length - 1; i++) {
    if (a[i] && a[i + 1] && a[i].toLowerCase() === t[i].toLowerCase() && a[i + 1].toLowerCase() === t[i + 1].toLowerCase()) cls++;
  }
  if (a[t.length - 1] && a[t.length - 1].toLowerCase() === t[t.length - 1]?.toLowerCase()) cls++;
  const correctWhole = a.toLowerCase() === t.toLowerCase();
  return { cls, max, correctWhole };
}

function summarizeLT(issues: GrammarIssue[]) {
  const byCat = new Map<string, number>();
  const byRule = new Map<string, number>();
  for (const m of issues) {
    byCat.set(m.categoryId ?? "?", (byCat.get(m.categoryId ?? "?") || 0) + 1);
    byRule.set(m.ruleId ?? "?", (byRule.get(m.ruleId ?? "?") || 0) + 1);
  }
  console.table([...byCat.entries()].map(([k,v])=>({category:k,count:v})));
  console.table([...byRule.entries()].map(([k,v])=>({rule:k,count:v})));
}

function filterLtIssues(text: string, issues: GrammarIssue[]) {
  const out: GrammarIssue[] = [];
  const seen = new Set<string>();

  // Log LT summary for dev parity checks
  if (process.env.NODE_ENV === 'development') {
    console.log('LT Issues Summary:');
    // Convert GrammarIssue[] to LTMatch[] format for summarizeLT
    const ltMatches = issues.map(issue => ({
      offset: issue.offset,
      length: issue.length,
      message: issue.message,
      shortMessage: issue.message,
      replacements: (issue.replacements || []).map(r => ({ value: r })),
      rule: {
        id: issue.ruleId || "",
        description: issue.message,
        category: { 
          id: issue.categoryId || "",
          name: issue.category || ""
        }
      }
    }));
    ltSummarizeLT(ltMatches);
  }

  for (const m of issues) {
    const catId = (m.categoryId || "").toUpperCase();
    const ruleId = (m.ruleId || "").toUpperCase();
    const catName = (m.category || "").toUpperCase();

    const isTypos = catId === "TYPOS" || ruleId.startsWith("MORFOLOGIK_RULE");
    if (isTypos) {
      const k = `spell-${m.offset}-${m.length}`;
      if (!seen.has(k)) { out.push({ ...m, category: "SPELLING" }); seen.add(k); }
      continue;
    }

    // Allow all standard LT categories: TYPOS, CAPITALIZATION, PUNCTUATION, TYPOGRAPHY, GRAMMAR, STYLE, SEMANTICS
    const allowedCategories = new Set(["TYPOS", "CAPITALIZATION", "PUNCTUATION", "TYPOGRAPHY", "GRAMMAR", "STYLE", "SEMANTICS"]);
    if (allowedCategories.has(catId) || allowedCategories.has(catName)) {
      const k = `${m.category}-${m.offset}-${m.length}-${m.message}`;
      if (!seen.has(k)) { out.push(m); seen.add(k); }
    }
  }
  return out;
}

function isTerminal(tok: Token) { return tok.type === "PUNCT" && /[.?!]/.test(tok.raw); }
function isWord(tok: Token)     { return tok.type === "WORD"; }
function isComma(tok: Token)    { return tok.type === "PUNCT" && tok.raw === ","; }
function isHyphen(tok: Token)   { return tok.type === "PUNCT" && tok.raw === "-"; }

// helper to decide caret visual for a boundary
function caretStateForBoundary(bIndex: number, pairByBoundary: Map<number, CwsPair>, pairOverrides: PairOverrides, advisoryHints: Map<number, { message: string }>, highlightedGroup?: TerminalGroup | null) {
  const pair = pairByBoundary.get(bIndex);
  if (!pair) return { eligible: false as const, state: "muted" as const, reason: "none", highlighted: false };

  const ov = pairOverrides[bIndex]?.cws;
  const advisory = advisoryHints.get(bIndex);

  // Check if this caret is part of the highlighted group
  const highlighted = highlightedGroup && (
    bIndex === highlightedGroup.groupLeftCaret ||
    bIndex === highlightedGroup.primaryCaret ||
    bIndex === highlightedGroup.groupRightCaret
  );

  // default validity (mechanical CWS)
  const baseValid = pair.valid;

  // final state machine
  if (!pair.eligible) return { eligible: false as const, state: "muted" as const, reason: "none", highlighted: !!highlighted };

  if (ov === false) return { eligible: true as const, state: "bad" as const, reason: pair.reason || "rule", highlighted: !!highlighted };
  if (ov === true)  return { eligible: true as const, state: "ok"  as const, reason: "override-ok", highlighted: !!highlighted };

  // If this boundary touches a virtual terminal and user hasn't overridden it, keep it advisory (yellow)
  if (pair.virtualBoundary) {
    if (ov === undefined) {
      return { eligible: true as const, state: "advisory" as const, reason: advisory?.message || "Inserted virtual terminal", highlighted: !!highlighted };
    }
  }

  // no override -> show advisory if base is ok but LT flagged the boundary
  if (baseValid && advisory) return { eligible: true as const, state: "advisory" as const, reason: advisory.message, highlighted: !!highlighted };

  // otherwise show base state
  return { eligible: true as const, state: baseValid ? "ok" : "bad", reason: pair.reason || "rule", highlighted: !!highlighted };
}

function cycleCaret(bIndex: number, pairOverrides: PairOverrides, setPairOverrides: React.Dispatch<React.SetStateAction<PairOverrides>>) {
  setPairOverrides(prev => {
    const cur = prev[bIndex]?.cws;
    const next = cur === undefined ? false : cur === false ? true : undefined;
    const clone = { ...prev };
    if (next === undefined) delete clone[bIndex];
    else clone[bIndex] = { cws: next };
    return clone;
  });
}

function dedupe(xs:{beforeBIndex:number;char:"." | "!" | "?";reason:"CapitalAfterSpace" | "LT" | "Heuristic";message:string}[]) {
  const seen = new Set<number>(), out: typeof xs = [];
  for (const x of xs) if (!seen.has(x.beforeBIndex)) { seen.add(x.beforeBIndex); out.push(x); }
  return out;
}

// Bulk toggle functionality for terminal groups
function cycleState(s: "yellow" | "red" | "green") {
  return s === "yellow" ? "red" : s === "red" ? "green" : "yellow";
}

function bulkToggleCarets(
  indexes: number[], 
  mode: "cycle" | "setRed" | "setGreen" = "cycle",
  pairOverrides: PairOverrides,
  setPairOverrides: React.Dispatch<React.SetStateAction<PairOverrides>>
) {
  setPairOverrides(prev => {
    const next = { ...prev };
    for (const i of indexes) {
      const cur = next[i]?.cws;
      let newState: boolean | undefined;
      
      if (mode === "cycle") {
        newState = cur === undefined ? false : cur === false ? true : undefined;
      } else if (mode === "setRed") {
        newState = false;
      } else if (mode === "setGreen") {
        newState = true;
      }
      
      if (newState === undefined) {
        delete next[i];
      } else {
        next[i] = { cws: newState };
      }
    }
    return next;
  });
}


function cwsPairValid(a: Token, b: Token, wsc: (w: string) => boolean): { ok: boolean; reason?: string } {
  // Commas don't count against pairs (CBM: ignore commas)
  if (isComma(a) || isComma(b)) return { ok: true };

  // WORD → WORD  => both words spelled correctly
  if (isWord(a) && isWord(b)) return { ok: wsc(a.raw) && wsc(b.raw), reason: "misspelling" };

  // WORD → TERMINAL  => preceding word must be spelled correctly; terminal must be . ? !
  if (isWord(a) && isTerminal(b)) return { ok: wsc(a.raw), reason: "misspelling-before-terminal" };

  // TERMINAL → WORD  => next word must start with capital letter
  if (isTerminal(a) && isWord(b)) return { ok: /^[A-Z]/.test(b.raw), reason: "capitalization" };

  // Hyphenated compound: WORD - WORD  => allow if both sides spelled correctly
  if (isWord(a) && isHyphen(b)) return { ok: true };
  if (isHyphen(a) && isWord(b)) return { ok: wsc(b.raw), reason: "misspelling-after-hyphen" };

  // Everything else: treat as neutral valid (don't penalize style/semantics)
  return { ok: true };
}

// ———————————— Writing: Spellcheck + CWS + Infractions ————————————

function computeTWW(tokens: Token[]): number {
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

function InfractionList({ 
  items, 
  vtByBoundary, 
  cycleGroup 
}: { 
  items: Infraction[];
  vtByBoundary?: Map<number, VirtualTerminal>;
  cycleGroup?: (group: VirtualTerminal) => void;
}) {
  if (!items.length) return <div className="text-sm text-muted-foreground">No infractions flagged.</div>;
  return (
    <div className="space-y-2">
      {items.map((f, i) => {
        // inside InfractionList row render
        const maybeGroup =
          (f.tag.startsWith("TERMINAL") && typeof f.at === "number")
            ? vtByBoundary?.get(f.at as number)
            : undefined;

        const RowTag = maybeGroup ? "button" : "div";
        const onClick = maybeGroup ? () => {
          const g = vtByBoundary?.get(f.at as number);
          console.log("[VT] suggestion click", { boundary: f.at, groupFound: !!g, g });
          if (g) cycleGroup?.(g); // toggles left caret + dot + right caret
        } : undefined;

        return (
          <RowTag
            key={i}
            className={`text-sm p-2 rounded-xl border ${f.kind === "definite" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"} ${maybeGroup ? "cursor-pointer hover:bg-opacity-80 transition-all duration-200" : ""}`}
            onClick={onClick}
            title={maybeGroup ? "Click to toggle all related carets (left, primary, right)" : undefined}
          >
            <div className="flex items-center gap-2">
              {f.kind === "definite" ? <AlertTriangle className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              <Badge variant={f.kind === "definite" ? "destructive" : "secondary"}>{f.tag}</Badge>
              <span>{f.msg}</span>
            </div>
          </RowTag>
        );
      })}
    </div>
  );
}

function TerminalSuggestions({ 
  groups, 
  onGroupClick,
  onGroupHover,
  onGroupLeave
}: { 
  groups: TerminalGroup[]; 
  onGroupClick: (group: TerminalGroup) => void;
  onGroupHover?: (group: TerminalGroup) => void;
  onGroupLeave?: () => void;
}) {
  if (!groups.length) return null;
  
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-blue-700">Terminal Punctuation Suggestions</div>
      {groups.map((group, i) => (
        <div
          key={i}
          className="text-sm p-2 rounded-xl border border-blue-300 bg-blue-50 cursor-pointer hover:bg-blue-100 hover:border-blue-400 transition-all duration-200 hover:shadow-sm"
          onClick={() => onGroupClick(group)}
          onMouseEnter={() => onGroupHover?.(group)}
          onMouseLeave={() => onGroupLeave?.()}
          title="Click to toggle all related carets (left, primary, right)"
        >
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-blue-600" />
            <Badge variant="outline" className="text-blue-700 border-blue-400">TERMINAL</Badge>
            <span className="text-blue-800">{group.message}</span>
            <span className="text-xs text-blue-600 ml-auto">
              Carets: {group.groupLeftCaret}, {group.primaryCaret}, {group.groupRightCaret}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function WritingScorer() {
  const [text, setText] = useState<string>(
    "It was dark. nobody could see the trees of the forest The Terrible Day\n\nI woud drink water from the ocean and I woud eat the fruit off of the trees Then I woud bilit a house out of trees and I woud gather firewood to stay warm I woud try and fix my boat in my spare time"
  );
  const [overrides, setOverrides] = useState<Record<string | number, WordOverride | PairOverride>>({});
  const [pairOverrides, setPairOverrides] = useState<PairOverrides>({});
  // Always-on flags (since the toggle is gone)
  const showInfractions = true;
  
  // LT-only mode for infractions panel
  const [ltOnlyMode, setLtOnlyMode] = useState(false);
  
  // State for highlighting terminal groups on hover
  const [highlightedGroup, setHighlightedGroup] = useState<TerminalGroup | null>(null);

  // If code referenced custom lexicon, freeze it empty:
  const customLexicon = useMemo(() => new Set<string>(), []);

  // If code referenced user-chosen dictionary packs, freeze to auto/default behavior.
  const selectedPacks: string[] = useMemo(() => ["us-k2","us-k5","general"], []);
  

  const [ltBusy, setLtBusy] = useState(false);
  const [ltIssues, setLtIssues] = useState<GrammarIssue[]>([]);
  const [grammarStatus, setGrammarStatus] = useState<"idle"|"checking"|"ok"|"error">("idle");
  const [ltIsPublic, setLtIsPublic] = useState<boolean | null>(null);
  
  // LanguageTool settings state
  const [showSettings, setShowSettings] = useState(false);
  const [ltBaseUrl, setLtBaseUrl] = useState("");
  const [ltPrivacy, setLtPrivacy] = useState("local");
  const lastCheckedText = useRef<string>("");    // to avoid duplicate checks
  const grammarRunId = useRef<number>(0);        // cancellation token for in-flight checks

  // Derive grammar mode label from LT client config
  const grammarModeLabel = useMemo(() => {
    if (ltPrivacy === "local") return "off (privacy)";
    if (grammarStatus === "checking") return "checking";
    if (grammarStatus === "error") return "error";
    if (grammarStatus === "idle") return "off";
    if (grammarStatus === "ok") {
      return ltIsPublic ? "public" : "auto (proxy)";
    }
    return "off";
  }, [grammarStatus, ltIsPublic, ltPrivacy]);

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

  // Load localStorage values after hydration to prevent hydration mismatch
  useEffect(() => {
    setLtBaseUrl(getLtBase());
    setLtPrivacy(getLtPrivacy());
  }, []);


  // place INSIDE WritingScorer(), after the autoload effect above
  useEffect(() => {
    const minChars = 24;  // don't run for very short snippets
    // Send raw text as-is (no trimming) to preserve offsets and trailing spaces/newlines
    if (text.length < minChars) {
      setLtIssues([]);
      setGrammarStatus("idle");
      return;
    }
    // Skip if nothing changed
    if (text === lastCheckedText.current) return;

    setGrammarStatus("checking");
    const myRun = ++grammarRunId.current;
    const handle = setTimeout(async () => {
      setLtBusy(true);
      try {
        const { createLanguageToolChecker } = await import("@/lib/grammar/languagetool-client");
        const lt = createLanguageToolChecker("/api/languagetool"); // use your proxy
        const issues = await lt.check(text, "en-US"); // Send raw text, no trimming
        if (grammarRunId.current !== myRun) return;
        setLtIssues(issues);
        setLtIsPublic(lt.isPublic());
        setGrammarStatus("ok");
        lastCheckedText.current = text; // Store raw text
      } catch (e) {
        if (grammarRunId.current !== myRun) return; // stale
        console.error("[Grammar] check failed", e);
        setGrammarStatus("error");
      } finally {
        if (grammarRunId.current === myRun) setLtBusy(false);
      }
    }, 800); // debounce ms

    return () => {
      clearTimeout(handle);
    };
  }, [text]);

  function buildMisspelledIndex(tokens: Token[], issues: GrammarIssue[]): Set<number> {
    const miss = new Set<number>();
    for (const m of issues) {
      const cat = (m.categoryId || "").toUpperCase();
      const rule = (m.ruleId || "").toUpperCase();
      // Spelling/typo matches in LT (e.g., MORFOLOGIK_RULE_EN_US, category TYPOS)
      const isSpelling = cat === "TYPOS" || rule.startsWith("MORFOLOGIK_RULE");
      if (!isSpelling) continue;
      const mStart = m.offset;
      const mEnd = m.offset + m.length;
      for (const t of tokens) {
        if (t.type !== "WORD") continue;
        const tStart = t.start ?? 0;
        const tEnd = t.end ?? tStart;
        // Use shared overlap helper
        if (overlaps(tStart, tEnd, mStart, mEnd)) miss.add(t.idx);
      }
    }
    return miss;
  }

  function isWordLikelyCorrectByLT(tokIdx: number): boolean {
    return !misspelledIdx.has(tokIdx);
  }

  function ltSuggestionsForToken(tok: Token): string[] {
    const start = tok.start ?? 0;
    const end = tok.end ?? start;
    const match = ltIssues.find(m => {
      const mStart = m.offset;
      const mEnd = m.offset + m.length;
      const cat = (m.categoryId || "").toUpperCase();
      const rule = (m.ruleId || "").toUpperCase();
      const isTypo = cat === "TYPOS" || rule.startsWith("MORFOLOGIK_RULE");
      return isTypo && overlaps(start, end, mStart, mEnd);
    });
    return match?.replacements || [];
  }

  // Dev helper: get overlapping rule IDs for a token (for smoke testing)
  function getOverlappingRuleIds(tok: Token): string[] {
    if (process.env.NODE_ENV !== 'development') return [];
    const start = tok.start ?? 0;
    const end = tok.end ?? start;
    const ruleIds: string[] = [];
    for (const m of ltIssues) {
      const mStart = m.offset;
      const mEnd = m.offset + m.length;
      if (overlaps(start, end, mStart, mEnd)) {
        ruleIds.push(m.ruleId || "?");
      }
    }
    return ruleIds;
  }

  function computeWSC(
    tokens: Token[],
    overrides: Record<number, WordOverride>,
    infractions: Infraction[]
  ): number {
    let count = 0;
    tokens.forEach((t) => {
      if (t.type !== "WORD") return;
      const ok = !misspelledIdx.has(t.idx);

      const ov = overrides[t.idx]?.csw;
      const effectiveOk = ov === true ? true : ov === false ? false : ok;

      if (!effectiveOk) {
        infractions.push({ kind: "possible", tag: "SPELLING", msg: `Possible misspelling: "${t.raw}"`, at: t.idx });
      }
      if (effectiveOk) count += 1;
    });
    return count;
  }

  function computeCWS(
    tokens: Token[],
    overrides: Record<string, PairOverride | WordOverride>,
    infractions: Infraction[]
  ): number {
    const stream = tokens;
    const isValidWord = (t: Token) => t.type === "WORD" && ((overrides[t.idx as number] as WordOverride)?.csw ?? !misspelledIdx.has(t.idx));

    let cws = 0;
    if (stream[0]) {
      if (isValidWord(stream[0])) cws += 1;
      else infractions.push({ kind: "definite", tag: "PAIR", msg: "Initial word not valid for CWS (spelling)", at: stream[0].idx });
    }

    for (let i = 0; i < stream.length - 1; i++) {
      const a = stream[i];
      const b = stream[i + 1];
      const pairKey = `${a.idx}-${b.idx}`;
      const manual = (overrides[pairKey] as PairOverride | undefined)?.cws;
      if (manual !== undefined) {
        if (manual) cws += 1;
        else infractions.push({ kind: "possible", tag: "PAIR", msg: `Manual override: NOT CWS at ${a.raw} ^ ${b.raw}`, at: pairKey });
        continue;
      }

      const wscFn = (w: string) => {
        const token = tokens.find(t => t.raw === w && t.type === "WORD");
        return token ? !misspelledIdx.has(token.idx) : true;
      };
      const { ok, reason } = cwsPairValid(a, b, wscFn);
      if (ok) { 
        cws++; 
      } else {
        // Only push a PAIR infraction for mechanical reasons
        if (reason === "capitalization") {
          infractions.push({ kind: "definite", tag: "CAPITALIZATION", msg: "Expected capital after sentence-ending punctuation", at: `${a.raw} ^ ${b.raw}` });
        } else if (reason?.startsWith("misspelling")) {
          // spelling errors are already counted under WSC and will surface separately; skip duplicating PAIR noise
        } else {
          // do nothing (we no longer penalize style like "off of", "to stay", etc.)
        }
      }
    }

    // Sentence-level flags
    const plain = tokens.map((t) => t.raw).join(" ");
    const sentences = sentenceBoundaries(plain);
    if (sentences.length > 0) {
      sentences.forEach((s) => {
        if (!/[\.!\?]$/.test(s.raw)) infractions.push({ kind: "possible", tag: "TERMINAL", msg: "Sentence may be missing terminal punctuation", at: s.raw.slice(0, 20) + "…" });
        const words = s.raw.split(/\s+/).filter((w) => WORD_RE.test(w));
        if (words.length > 30) infractions.push({ kind: "possible", tag: "RUN_ON", msg: "Long sentence (>30 words) – possible run-on", at: s.raw.slice(0, 20) + "…" });
        const firstWord = words[0];
        const normalizedFirst = firstWord ? firstWord.replace(/[']/g, "'") : "";
        if (normalizedFirst && !/^[A-Z]/.test(normalizedFirst)) {
          infractions.push({ kind: "definite", tag: "CAPITALIZATION", msg: "Sentence should start with a capital letter", at: firstWord });
        }
      });
    }

    return cws;
  }

  const lexicon = useMemo(() => buildLexicon(selectedPacks, ""), [selectedPacks]);
  
  const tokens = useMemo(() => tokenizeWithOffsets(text), [text]);

  const misspelledIdx = useMemo(
    () => buildMisspelledIndex(tokens, ltIssues),
    [tokens, ltIssues]
  );
  
  const ltFiltered = useMemo(
    () => ltIssues.filter((m) => !isCommaOnlyForCWS(m, tokens)),
    [ltIssues, tokens]
  );

  // Build filtered LT issues once
  const filteredLt = useMemo(() => {
    const ids = new Set([
      "PUNCTUATION_PARAGRAPH_END",     // LT: missing end-of-paragraph punctuation
      "MISSING_SENTENCE_TERMINATOR",   // LT: classic "needs . ! ?"
      "UPPERCASE_SENTENCE_START"       // LT: new sentence detected; implies terminal before it
    ]);
    return (ltIssues ?? []).filter(i => ids.has(i.ruleId as string));
  }, [ltIssues]);

  // LT → insertions (caret placed at the boundary BEFORE the next token)
  const ltInsertions = useMemo<VirtualTerminalInsertion[]>(() => {
    return convertLTTerminalsToInsertions(tokens, filteredLt);
  }, [tokens, filteredLt]);

  // Paragraph ends → insertions
  const eopInsertions = useMemo<VirtualTerminalInsertion[]>(() => {
    return detectParagraphEndInsertions(text, tokens);
  }, [text, tokens]);

  // LT-only terminal insertions (no heuristics)
  const terminalInsertions = useMemo<VirtualTerminalInsertion[]>(() => {
    const out = ltInsertions;
    if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
      console.info("[VT] counts", { lt: out.length, eop: 0, insertions: out.length });
    }
    return out;
  }, [ltInsertions]);

  // 2) insert virtual terminals for display + scoring
  const displayTokens = useMemo(
    () => insertVirtualTerminals(tokens, terminalInsertions),
    [tokens, terminalInsertions]
  );

  // 2.5) create virtual terminals with boundary indices
  const virtualTerminals = useMemo(
    () => createVirtualTerminalsFromDisplay(displayTokens),
    [displayTokens]
  );
  DEBUG && dgroup("[VT] virtualTerminals (groups)", () => dlog(virtualTerminals));

  // Add counts logging to show the exact break
  console.log("[VT] counts", {
    insertions: terminalInsertions?.length ?? -1,
    displayDots: displayTokens.filter((t:any)=>t?.virtual && t.type==="PUNCT" && /[.?!]/.test(t.raw)).length,
    groups: virtualTerminals?.length ?? -1,
  });

  // Find a virtual terminal by dot index (you already pass them down with scoring)
  const vtByDotIndex = useMemo(() => {
    const m = new Map<number, VirtualTerminal>();
    for (const v of virtualTerminals) m.set(v.dotTokenIndex, v);
    return m;
  }, [virtualTerminals]);
  DEBUG && dgroup("[VT] vtByDotIndex", () =>
    dtable("map", [...vtByDotIndex.entries()].map(([k, v]) => ({ dotIndex: k, left: v.leftBoundaryBIndex, right: v.rightBoundaryBIndex })))
  );

  const vtByBoundary = useMemo(() => {
    const m = new Map<number, VirtualTerminal>();
    for (const v of virtualTerminals) {
      m.set(v.leftBoundaryBIndex, v);
      m.set(v.rightBoundaryBIndex, v);
    }
    return m;
  }, [virtualTerminals]);
  DEBUG && vtByBoundary && dgroup("[VT] vtByBoundary", () =>
    dtable("map", [...vtByBoundary.entries()].map(([k, v]) => ({ boundary: k, dot: v.dotTokenIndex })))
  );

  // 3) create a quick map of advisory carets around each virtual terminal
  const virtualBoundaryHints = useMemo(() => {
    const m = new Map<number, { message: string }>();
    for (const v of terminalInsertions) {
      // Caret before the inserted punctuation
      m.set(v.beforeBIndex, { message: v.message });
      // Caret after the inserted punctuation (shifted by +1 due to insertion)
      m.set(v.beforeBIndex + 1, { message: v.message });
    }
    return m;
  }, [terminalInsertions]);

  const stream = useMemo(() => displayTokens, [displayTokens]);

  const cwsPairs = useMemo(() => {
    const spell = (w: string) => {
      const token = displayTokens.find(t => t.raw === w && t.type === "WORD");
      return token ? !misspelledIdx.has(token.idx) : true;
    };
    return buildCwsPairs(displayTokens, spell, pairOverrides);
  }, [displayTokens, misspelledIdx, pairOverrides]);

  // Audit data for CSV export
  const audit = useMemo(() => {
    return cwsPairs.map(p => ({
      bIndex: p.bIndex,
      left: displayTokens[p.leftTok || 0]?.raw || "",
      right: displayTokens[p.rightTok || 0]?.raw || "",
      eligible: p.eligible,
      baseValid: p.valid,
      virtualBoundary: p.virtualBoundary,
      override: pairOverrides[p.bIndex]?.cws ?? null,
      reason: p.reason || ""
    }));
  }, [cwsPairs, displayTokens, pairOverrides]);

  // Make sure virtual carets don't count unless accepted
  function isPairCounted(bIndex: number, pair: CwsPair): boolean {
    const ov = pairOverrides[bIndex]?.cws;
    if (ov === true) return true;
    if (ov === false) return false;
    // virtual terminals are advisory by default (not counted)
    if (pair.virtualBoundary) return false;
    // otherwise, rely on the mechanical validity
    return !!pair.valid;
  }

  const cwsCount = useMemo(
    () => cwsPairs.reduce((n, p) => n + (p.eligible && isPairCounted(p.bIndex, p) ? 1 : 0), 0),
    [cwsPairs, pairOverrides]
  );

  const eligibleBoundaries = useMemo(
    () => cwsPairs.reduce((n, p) => n + (p.eligible ? 1 : 0), 0),
    [cwsPairs]
  );
  const iws = useMemo(() => Math.max(eligibleBoundaries - cwsCount, 0), [eligibleBoundaries, cwsCount]);
  const ciws = useMemo(() => cwsCount - iws, [cwsCount, iws]);
  const percentCws = useMemo(
    () => (eligibleBoundaries ? Math.round((100 * cwsCount) / eligibleBoundaries) : 0),
    [eligibleBoundaries, cwsCount]
  );
  const cwsPerMin = useMemo(
    () => (durationMin ? (cwsCount / durationMin) : null),
    [cwsCount, durationMin]
  );

  const tww = useMemo(() => computeTWW(tokens), [tokens]);

  // Optional (super useful) LT debug table
  if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
    console.group("[LT] issues");
    console.table(filteredLt.map(r => ({
      id: r.ruleId,
      category: r.categoryId,
      msg: r.message,
      offset: r.offset,
      len: r.length,
      reps: (r.replacements || []).join(" | "),
    })));
    console.groupEnd();
  }
  
  // Compute advisory hints (memoized)
  const ltHintsMap = useMemo(() => buildLtCwsHints(text, tokens, ltIssues), [text, tokens, ltIssues]);

  // If you already build LT hints, merge them with priority to LanguageTool:
  const advisoryHints = useMemo(() => {
    const m = new Map<number, { message: string }>();
    // heuristics first
    virtualBoundaryHints.forEach((h, k) => m.set(k, h));
    // LT may override the message for the same boundary
    ltHintsMap?.forEach((h, k) => m.set(k, h));
    return m;
  }, [virtualBoundaryHints, ltHintsMap]);

  // Build terminal groups from LT issues
  const terminalGroups = useMemo(() => {
    // Create a map of caret states for the terminal groups function
    const caretStateMap = new Map<number, "yellow" | "red" | "green">();
    
    // Populate caret states based on pair overrides
    for (const [bIndex, override] of Object.entries(pairOverrides)) {
      const index = parseInt(bIndex);
      if (override.cws === true) {
        caretStateMap.set(index, "green");
      } else if (override.cws === false) {
        caretStateMap.set(index, "red");
      } else {
        caretStateMap.set(index, "yellow");
      }
    }
    
    return buildTerminalGroups(tokens, caretStateMap, ltFiltered);
  }, [tokens, pairOverrides, ltFiltered]);

  // Fast lookup maps
  const pairByBoundary = useMemo(() => {
    const m = new Map<number, ReturnType<typeof Object>>();
    for (const p of cwsPairs) m.set(p.bIndex, p);
    return m;
  }, [cwsPairs]);
  
  const { wsc, cws, infractions } = useMemo(() => {
    const infractions: Infraction[] = [];
    let wsc = 0;
    let cws = 0;
    
    if (ltOnlyMode) {
      // LT-only mode: only show LanguageTool issues
      for (const m of filteredLt) {
        infractions.push({ 
          kind: "possible", 
          tag: m.category.toUpperCase(), 
          msg: m.message, 
          at: `${m.offset}:${m.length}` 
        });
      }
    } else {
      // Full mode: include all heuristic and LT issues
      wsc = computeWSC(tokens, overrides as Record<number, WordOverride>, infractions);
      cws = computeCWS(tokens, overrides as Record<string, PairOverride | WordOverride>, infractions);
      
      // Add CWS-specific infractions based on caret reasons
      for (const p of cwsPairs) {
        if (p.eligible) {
          const ov = pairOverrides[p.bIndex]?.cws;
          const ok = ov === true ? true : ov === false ? false : p.valid;
          if (!ok) {
            const reason = p.reason || "rule";
            const tag =
              reason === "capitalization" ? "CAPITALIZATION" :
              reason === "misspelling"    ? "SPELLING" :
              reason === "nonessential-punct" ? "PUNCTUATION" :
              reason === "not-units"      ? "PAIR" :
              "PAIR";
            const msg =
              reason === "capitalization" ? "Expected capital after sentence-ending punctuation" :
              reason === "misspelling"    ? "Spelling error breaks the sequence" :
              reason === "nonessential-punct" ? "Non-essential punctuation breaks sequence" :
              reason === "not-units"      ? "Invalid unit adjacency" :
              "Invalid adjacency";
            infractions.push({ kind: "definite", tag, msg, at: p.bIndex });
          }
          
          // Red/green reasons in infractions panel (when pushing infractions): if a pair is virtualBoundary and not overridden, push a possible item with your message:
          if (p.virtualBoundary) {
            if (ov === undefined && p.eligible) {
              infractions.push({
                kind: "possible",
                tag: "TERMINAL (possible)",
                msg: advisoryHints.get(p.bIndex)?.message || "Possible missing terminal punctuation",
                at: p.bIndex
              });
            }
          }
        }
      }
      
      // Add advisory entries from LanguageTool hints and heuristics
      for (const [bIndex, hint] of advisoryHints) {
        const pair = pairByBoundary.get(bIndex);
        const ov = pairOverrides[bIndex]?.cws;
        if (pair && pair.eligible && ov === undefined && pair.valid) {
          infractions.push({ kind: "possible", tag: "TERMINAL (possible)", msg: hint.message, at: bIndex });
        }
      }
      
      // Merge ONLY filteredLt into infractions
      for (const m of filteredLt) {
        infractions.push({ kind: "possible", tag: m.category.toUpperCase(), msg: m.message, at: `${m.offset}:${m.length}` });
      }
      
      // Add infractions for proposed virtual terminals
      for (const v of terminalInsertions) {
        infractions.push({
          kind: "possible",
          tag: "TERMINAL",
          msg: "Possible missing sentence-ending punctuation before \"" +
               tokens[v.beforeBIndex + 1]?.raw + "\" (Figure 4). Click caret to accept/reject.",
          at: v.beforeBIndex
        });
      }
    }
    
    return { wsc, cws, infractions };
  }, [tokens, overrides, filteredLt, cwsPairs, pairOverrides, ltHintsMap, pairByBoundary, terminalInsertions, misspelledIdx, ltOnlyMode]);

  // Export functions
  const exportCSV = () => {
    // Use a timestamp that's generated on the client side to avoid hydration mismatch
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    download(`cbm-audit-${timestamp}.csv`, toCSV(audit));
  };

  const cycleGroup = useCallback((group: VirtualTerminal) => {
    setPairOverrides(prev => {
      const next = { ...prev };
      const state = triForGroup(group, prev);
      const to = state === "yellow" ? "red" : state === "red" ? "green" : "yellow";
      const apply = (b: number, tri: Tri) => {
        if (tri === "yellow") delete next[b];
        else next[b] = { cws: tri === "green" };
      };
      apply(group.leftBoundaryBIndex, to);
      apply(group.rightBoundaryBIndex, to);
      return next;
    });
  }, []);

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

  // LanguageTool settings functions
  const saveLtSettings = () => {
    localStorage.setItem("lt.base", ltBaseUrl);
    localStorage.setItem("lt.privacy", ltPrivacy);
    setShowSettings(false);
    // Clear current grammar issues since settings changed
    setLtIssues([]);
    setGrammarStatus("idle");
  };

  // Clear session data function
  const handleClearSessionData = () => {
    if (confirm("Clear all session data? This will reset settings and clear the text area.")) {
      clearSessionData();
      setText(""); // Clear the textarea
      setLtIssues([]); // Clear grammar issues
      setGrammarStatus("idle");
      setShowSettings(false);
      // Reset settings to defaults
      setLtBaseUrl(getLtBase());
      setLtPrivacy(getLtPrivacy());
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Written Expression (TWW, WSC, CWS) – with Flags</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Page body */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT: Textbox + controls + legend + stream */}
          <div className="space-y-3">
            {/* Student writing textarea */}
            <div>
              <label className="text-sm font-medium">Paste student writing</label>
              <Textarea className="min-h-[160px] mt-1" value={text} onChange={(e) => setText(e.target.value)} />
            </div>

            {/* Control strip: time + annunciators */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
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

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Spell:</span>
                <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs">
                  LanguageTool
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Grammar:</span>
                <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs">
                  {grammarModeLabel /* e.g., "auto (proxy)" | "public" | "off" */}
                </span>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title="LanguageTool Settings"
                >
                  <Settings className="h-3 w-3" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Infractions:</span>
                <button
                  onClick={() => setLtOnlyMode(!ltOnlyMode)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    ltOnlyMode 
                      ? "bg-blue-100 text-blue-700 border border-blue-300" 
                      : "bg-slate-100 text-slate-700 border border-slate-300"
                  }`}
                  title={ltOnlyMode ? "Show only LanguageTool issues" : "Show all issues (heuristic + LT)"}
                >
                  {ltOnlyMode ? "LT Only" : "All Issues"}
                </button>
              </div>
            </div>

            {/* LanguageTool Settings Popover */}
            {showSettings && (
              <div className="mt-3 p-4 border rounded-lg bg-white shadow-lg">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">LanguageTool Settings</h3>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      LT Endpoint URL
                    </label>
                    <input
                      type="url"
                      value={ltBaseUrl}
                      onChange={(e) => setLtBaseUrl(e.target.value)}
                      placeholder="https://your-lt.example.com"
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Leave empty to use default public API
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={ltPrivacy === "local"}
                        onChange={(e) => setLtPrivacy(e.target.checked ? "local" : "cloud")}
                        className="rounded"
                      />
                      <span className="text-xs font-medium text-slate-700">
                        Don't send text to cloud grammar
                      </span>
                    </label>
                    <p className="text-xs text-slate-500 mt-1">
                      When enabled, grammar checking is disabled for privacy
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={saveLtSettings}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="px-3 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
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
                possible (LanguageTool / heuristic)
              </span>
              <span className="text-slate-500">Click caret to cycle: yellow → red → green → yellow</span>
            </div>

            {/* Highlighted word/caret stream */}
            <div className="mt-3 flex flex-wrap gap-1 p-3 rounded-2xl bg-muted/40">
              {/* initial caret uses bIndex = -1 */}
              {(() => {
                const { eligible, state, reason, highlighted } = caretStateForBoundary(-1, pairByBoundary, pairOverrides, advisoryHints, highlightedGroup);
                const baseCls =
                  state === "muted"    ? "text-slate-300"
                : state === "ok"       ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : state === "advisory" ? "bg-amber-100 text-amber-800 border border-amber-300"
                :                        "bg-red-100 text-red-700 border border-red-300";
                
                const highlightCls = highlighted ? "ring-2 ring-blue-400 ring-opacity-50 shadow-lg" : "";
                const cls = `${baseCls} ${highlightCls}`;

                const title =
                  !eligible ? "Not counted for CWS (comma/quote/etc.)"
                : state === "ok"       ? "CWS: counted (click to cycle)"
                : state === "advisory" ? `Possible CWS issue (LT): ${reason}\nClick = mark incorrect (red), click again = correct (green), click again = clear`
                :                        (reason === "capitalization" ? "Needs capitalization" : "Blocked (spelling)");

                return (
                  <button
                    type="button"
                    onClick={() => eligible && cycleCaret(-1, pairOverrides, setPairOverrides)}
                    className={`mx-1 px-1 rounded transition-all duration-200 ${cls}`}
                    title={title}
                  >
                    ^
                  </button>
                );
              })()}
              {displayTokens.map((tok, i) => {
                const isWordTok = tok.type === "WORD";
                const isVirtual = (tok as DisplayToken).virtual;
                const isVirtualDot = isVirtual && tok.raw === ".";
                const vt = isVirtualDot ? vtByDotIndex.get(i) : undefined;
                const groupTri: Tri | undefined = vt ? triForGroup(vt, pairOverrides) : undefined;
                const ok = !misspelledIdx.has(tok.idx);
                const ov = (overrides[tok.idx] as WordOverride)?.csw;
                const effectiveOk = ov === true ? true : ov === false ? false : ok;
                const bad = showInfractions && isWordTok && !effectiveOk;
                
                const sugg = (isWordTok && !effectiveOk) ? ltSuggestionsForToken(tok).slice(0, 3) : [];
                const overlappingRules = getOverlappingRuleIds(tok);
                const title = isWordTok
                  ? effectiveOk ? "WSC: counted (click to mark incorrect)"
                           : `WSC: NOT counted (click to mark correct)${sugg.length ? "\nSuggestions: " + sugg.join(", ") : ""}`
                  : tok.type;
                
                // Dev badge for token offsets smoke test
                const devBadge = process.env.NODE_ENV === 'development' && overlappingRules.length > 0 
                  ? `\n[${tok.start},${tok.end}] rules: ${overlappingRules.join(',')}`
                  : process.env.NODE_ENV === 'development' 
                    ? `\n[${tok.start},${tok.end}]`
                    : '';

                // token chip classes
                const baseChip = "inline-flex items-center rounded px-2 py-1 text-sm border select-none";
                const virtualClasses = isVirtual
                  ? isVirtualDot
                    ? groupTri === "green"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : groupTri === "red"
                        ? "bg-red-50 border-red-300 text-red-700"
                        : "bg-amber-50 border-amber-300 text-amber-700 border-dashed"
                    : "bg-amber-50 border-amber-300 text-amber-800 border-dashed"
                  : "bg-slate-50 border-slate-200";

                return (
                  <React.Fragment key={`tok-${i}`}>
                    {/* TOKEN */}
                    <button
                      className={cn(
                        baseChip,
                        isVirtual
                          ? virtualClasses
                          : isWordTok
                            ? bad
                              ? "bg-red-100 text-red-700 border-red-300"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-700 border-slate-200",
                        vt && "cursor-pointer hover:ring-2 hover:ring-amber-200 focus:outline-none focus:ring-2"
                      )}
                      title={
                        vt
                          ? "Proposed terminal (Figure 4). Click: yellow→red (reject) → green (accept) → yellow."
                          : isVirtual ? "Inserted: possible missing terminal" : title + devBadge
                      }
                      onClick={() => {
                        if (vt) {
                          dlog("[VT] dot click", { dotIndex: i, hasGroup: !!vt, vt });
                          cycleGroup(vt);
                        } else if (isWordTok) {
                          setOverrides((o) => ({ ...o, [tok.idx]: { ...(o[tok.idx] as WordOverride), csw: !(effectiveOk) } }));
                        }
                      }}
                      onKeyDown={vt ? (e) => (e.key === "Enter" || e.key === " ") && cycleGroup(vt) : undefined}
                      tabIndex={vt ? 0 : -1}
                      role={vt ? "button" : undefined}
                    >
                      {(tok as DisplayToken).display ?? tok.raw}
                    </button>

                    {/* CARET */}
                    {i < displayTokens.length - 1 && (
                      (() => {
                        const { eligible, state, reason, highlighted } = caretStateForBoundary(i, pairByBoundary, pairOverrides, advisoryHints, highlightedGroup);
                        const baseCls =
                          state === "muted"    ? "text-slate-300"
                        : state === "ok"       ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : state === "advisory" ? "bg-amber-100 text-amber-800 border border-amber-300"
                        :                        "bg-red-100 text-red-700 border border-red-300";
                        
                        const highlightCls = highlighted ? "ring-2 ring-blue-400 ring-opacity-50 shadow-lg" : "";
                        const cls = `${baseCls} ${highlightCls}`;

                        const title =
                          !eligible ? "Not counted for CWS (comma/quote/etc.)"
                        : state === "ok"       ? "CWS: counted (click to cycle)"
                        : state === "advisory" ? `Possible CWS issue (LT): ${reason}\nClick = mark incorrect (red), click again = correct (green), click again = clear`
                        :                        (reason === "capitalization" ? "Needs capitalization" : "Blocked (spelling)");

                        return (
                          <button
                            type="button"
                            onClick={() => eligible && cycleCaret(i, pairOverrides, setPairOverrides)}
                            className={`mx-1 px-1 rounded transition-all duration-200 ${cls}`}
                            title={title}
                          >
                            ^
                          </button>
                        );
                      })()
                    )}
                  </React.Fragment>
                );
              })}
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
                value={tww /* your TWW value */}
                sub="numerals excluded"
              />
              <StatCard
                title="Words Spelled Correctly"
                value={wsc /* your WSC value */}
                sub="dictionary + overrides"
              />
              <StatCard
                title="Correct Writing Sequences"
                value={cwsCount}
                sub="adjacent-unit pairs"
              />

              <StatCard
                title="% CWS"
                value={<>{percentCws}<span className="text-2xl">%</span></>}
                sub={`${cwsCount}/${eligibleBoundaries} eligible boundaries`}
              />
              <StatCard
                title="CIWS"
                value={ciws}
                sub={`CWS − IWS (IWS=${iws})`}
              />
              <StatCard
                title="CWS / min"
                value={cwsPerMin === null ? "—" : (Math.round(cwsPerMin * 10) / 10).toFixed(1)}
                sub={durationSec ? `${timeMMSS} timed` : "enter time"}
              />
            </div>

            {/* Infractions & Suggestions list — always visible now */}
            <div>
              <div className="mb-2 text-sm font-medium">Infractions &amp; Suggestions</div>
              <InfractionList 
                items={infractions} 
                vtByBoundary={vtByBoundary}
                cycleGroup={cycleGroup}
              />
              <TerminalSuggestions 
                groups={terminalGroups}
                onGroupClick={(group) => {
                  bulkToggleCarets(
                    [group.groupLeftCaret, group.primaryCaret, group.groupRightCaret],
                    "cycle",
                    pairOverrides,
                    setPairOverrides
                  );
                }}
                onGroupHover={(group) => setHighlightedGroup(group)}
                onGroupLeave={() => setHighlightedGroup(null)}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          <p className="font-medium">Scoring guidance</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>TWW</strong>: all words written; include misspellings; exclude numerals.</li>
            <li><strong>WSC</strong>: each correctly spelled word in isolation (override by clicking). Uses LanguageTool for spell checking; otherwise, a custom-lexicon fallback is used.</li>
            <li><strong>CWS</strong>: adjacent units (words & essential punctuation). Commas excluded. Initial valid word counts 1. Capitalize after terminals.</li>
          </ul>
        </div>

        {/* Privacy Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Privacy:</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                ltPrivacy === "local" 
                  ? "bg-green-100 text-green-700" 
                  : "bg-amber-100 text-amber-700"
              }`}>
                {ltPrivacy === "local" ? "Local-only (no text leaves this browser)" : "Cloud grammar enabled"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(true)}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {ltPrivacy === "local" ? "Enable cloud grammar" : "Privacy settings"}
              </button>
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

function SpellingScorer() {
  const [targets, setTargets] = useState<string>("because, friend, talk, forest, terrible");
  const [attempts, setAttempts] = useState<string>("becuse, frend, tack, forist, terribel");

  const targetList = useMemo(() => targets.split(/,|;|\n/).map((w) => w.trim()).filter(Boolean), [targets]);
  const attemptList = useMemo(() => attempts.split(/,|;|\n/).map((w) => w.trim()).filter(Boolean), [attempts]);

  const rows = useMemo(() => {
    const n = Math.max(targetList.length, attemptList.length);
    const r: { target: string; attempt: string; cls: number; max: number; correct: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const t = targetList[i] ?? "";
      const a = attemptList[i] ?? "";
      const { cls, max, correctWhole } = clsForWord(t, a);
      r.push({ target: t, attempt: a, cls, max, correct: correctWhole });
    }
    return r;
  }, [targetList, attemptList]);

  const totals = useMemo(() => rows.reduce((acc, r) => {
    acc.cls += r.cls; acc.max += r.max; if (r.correct) acc.wordsCorrect += 1; if (r.target) acc.wordsTotal += 1; return acc;
  }, { cls: 0, max: 0, wordsCorrect: 0, wordsTotal: 0 }), [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spelling (Correct Letter Sequences)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Target words (comma/semicolon/newline separated)</label>
            <Textarea className="min-h-[120px] mt-1" value={targets} onChange={(e) => setTargets(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Student attempts (aligned order)</label>
            <Textarea className="min-h-[120px] mt-1" value={attempts} onChange={(e) => setAttempts(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Attempt</th>
                <th className="py-2 pr-4">CLS</th>
                <th className="py-2 pr-4">Max</th>
                <th className="py-2 pr-4">Word Correct</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-4">{i + 1}</td>
                  <td className="py-1 pr-4 font-medium">{r.target}</td>
                  <td className="py-1 pr-4">{r.attempt}</td>
                  <td className="py-1 pr-4">{r.cls}</td>
                  <td className="py-1 pr-4">{r.max}</td>
                  <td className="py-1 pr-4">{r.correct ? "✓" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="p-3 rounded-2xl bg-white shadow-sm">
            <div className="text-xs text-muted-foreground">Total CLS</div>
            <div className="text-2xl font-semibold">{totals.cls}</div>
          </div>
          <div className="p-3 rounded-2xl bg-white shadow-sm">
            <div className="text-xs text-muted-foreground">Max CLS</div>
            <div className="text-2xl font-semibold">{totals.max}</div>
          </div>
          <div className="p-3 rounded-2xl bg-white shadow-sm">
            <div className="text-xs text-muted-foreground">Words Correct</div>
            <div className="text-2xl font-semibold">{totals.wordsCorrect} / {totals.wordsTotal}</div>
          </div>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>CLS</strong> counts boundary + adjacent letter pairs per target word (partial knowledge credit).</li>
            <li>Use aligned lists so attempt #i corresponds to target #i.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CBMApp(): JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl md:text-3xl font-bold">
          CBM Writing & Spelling – Web Tool (TS) + Dictionary Packs & Flags
        </motion.h1>

        <div className="mt-4">
          <Tabs defaultValue="writing">
            <TabsList>
              <TabsTrigger value="writing">Written Expression</TabsTrigger>
              <TabsTrigger value="spelling">Spelling</TabsTrigger>
            </TabsList>
            <TabsContent value="writing" className="mt-3">
              <WritingScorer />
            </TabsContent>
            <TabsContent value="spelling" className="mt-3">
              <SpellingScorer />
            </TabsContent>
          </Tabs>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Implementation Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm list-disc ml-5 space-y-1">
              <li><strong>Dictionary packs</strong>: demo packs included; swap in real dictionaries or WASM spellcheckers for production.</li>
              <li><strong>Capitalization & terminals</strong>: heuristic checks flag definite/possible issues for quick review.</li>
              <li><strong>Overrides</strong>: click words to toggle WSC; click carets to toggle CWS.</li>
              <li><strong>Extensibility</strong>: uses LanguageTool for spell checking; add POS-based rules if desired.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
