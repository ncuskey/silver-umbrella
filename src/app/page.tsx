"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, ListChecks, Settings } from "lucide-react";
import type { Token, VirtualTerminalInsertion } from "@/lib/types";
import { checkWithLT } from "@/lib/ltClient";
import { filterTerminalIssues, ltRuleId, ltCategory, logAllLtIssues } from "@/lib/ltFilter";
import { ltIssuesToInsertions } from "@/lib/ltToVT";
import { tokenize } from "@/lib/tokenize";
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

const triForGroup = (group: any, pairOverrides: Record<number, { cws?: boolean }>): Tri => {
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

function summarizeLT(issues: any[]) {
  const byCat = new Map<string, number>();
  const byRule = new Map<string, number>();
  for (const m of issues) {
    byCat.set(m.categoryId ?? "?", (byCat.get(m.categoryId ?? "?") || 0) + 1);
    byRule.set(m.ruleId ?? "?", (byRule.get(m.ruleId ?? "?") || 0) + 1);
  }
  console.table([...byCat.entries()].map(([k,v])=>({category:k,count:v})));
  console.table([...byRule.entries()].map(([k,v])=>({rule:k,count:v})));
}

// Complex LT filtering removed - using simple filter from lib

function isTerminal(tok: Token) { return tok.type === "PUNCT" && /[.?!]/.test(tok.raw); }
function isWord(tok: Token)     { return tok.type === "WORD"; }
function isComma(tok: Token)    { return tok.type === "PUNCT" && tok.raw === ","; }
function isHyphen(tok: Token)   { return tok.type === "PUNCT" && tok.raw === "-"; }

// Complex helper functions removed - using LT-only approach

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

function InfractionList({ items }: { items: Infraction[] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground">No infractions flagged.</div>;
  return (
    <div className="space-y-2">
      {items.map((f, i) => (
        <div
          key={i}
          className={`text-sm p-2 rounded-xl border ${f.kind === "definite" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}
        >
          <div className="flex items-center gap-2">
            {f.kind === "definite" ? <AlertTriangle className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
            <Badge variant={f.kind === "definite" ? "destructive" : "secondary"}>{f.tag}</Badge>
            <span>{f.msg}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// TerminalSuggestions component removed - using LT-only approach

function WritingScorer() {
  const [text, setText] = useState<string>(
    "It was dark. nobody could see the trees of the forest The Terrible Day\n\nI woud drink water from the ocean and I woud eat the fruit off of the trees Then I woud bilit a house out of trees and I woud gather firewood to stay warm I woud try and fix my boat in my spare time"
  );
  const [overrides, setOverrides] = useState<Record<string | number, WordOverride | PairOverride>>({});
  const [pairOverrides, setPairOverrides] = useState<PairOverrides>({});
  // Always-on flags (since the toggle is gone)
  const showInfractions = true;

  // If code referenced custom lexicon, freeze it empty:
  const customLexicon = useMemo(() => new Set<string>(), []);

  // If code referenced user-chosen dictionary packs, freeze to auto/default behavior.
  const selectedPacks: string[] = useMemo(() => ["us-k2","us-k5","general"], []);
  

  const [ltIssues, setLtIssues] = useState<any[]>([]);
  
  // LanguageTool settings state
  const [showSettings, setShowSettings] = useState(false);
  const [ltBaseUrl, setLtBaseUrl] = useState("");
  const [ltPrivacy, setLtPrivacy] = useState("local");
  const lastCheckedText = useRef<string>("");    // to avoid duplicate checks
  const grammarRunId = useRef<number>(0);        // cancellation token for in-flight checks

  // Simple grammar mode label
  const grammarModeLabel = "LT-only";

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


  useEffect(() => {
    let alive = true;
    (async () => {
      const json = await checkWithLT(text);
      const issues = (json.matches ?? json.issues ?? []) as any[];

      if ((window as any).__CBM_DEBUG__) {
        logAllLtIssues(issues, text);
      }

      if (alive) setLtIssues(issues);
    })();
    return () => { alive = false; };
  }, [text]);

// Complex functions removed - using LT-only approach

  // Complex WSC/CWS computation removed - using LT-only approach

  const lexicon = useMemo(() => buildLexicon(selectedPacks, ""), [selectedPacks]);
  
  const tokens = useMemo<Token[]>(() => tokenize(text), [text]);

  const filteredLt = useMemo(() => {
    const out = filterTerminalIssues(ltIssues);
    if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) console.info("[LT] filtered", out.map(ltRuleId));
    return out;
  }, [ltIssues]);

  const terminalInsertions = useMemo<VirtualTerminalInsertion[]>(() => {
    const ins = ltIssuesToInsertions(text, tokens, filteredLt);
    if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) console.info("[VT] counts", { lt: ins.length, eop: 0, insertions: ins.length });
    return ins;
  }, [text, tokens, filteredLt]);

  // Simple display tokens (just the original tokens for now)
  const displayTokens = useMemo(() => tokens, [tokens]);

  // Simplified CWS pairs (placeholder for now)
  const cwsPairs = useMemo(() => [], []);

  // Simplified metrics (placeholder for now)
  const audit = useMemo(() => [], []);
  const cwsCount = 0;
  const eligibleBoundaries = 0;
  const iws = 0;
  const ciws = 0;
  const percentCws = 0;
  const cwsPerMin = null;
  const tww = useMemo(() => tokens.filter(t => t.type === "WORD").length, [tokens]);

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
  
  const infractions = useMemo(() => {
    return filteredLt.map(i => ({
      kind: "possible" as const,
      tag: ltCategory(i).toUpperCase(),
      msg: (i.msg ?? i.message ?? "—"),
      at: `${i.offset}:${i.length}`
    }));
  }, [filteredLt]);

  const wsc = 0; // placeholder
  const cws = 0; // placeholder

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

  // LanguageTool settings functions
  const saveLtSettings = () => {
    localStorage.setItem("lt.base", ltBaseUrl);
    localStorage.setItem("lt.privacy", ltPrivacy);
    setShowSettings(false);
    // Clear current grammar issues since settings changed
    setLtIssues([]);
  };

  // Clear session data function
  const handleClearSessionData = () => {
    if (confirm("Clear all session data? This will reset settings and clear the text area.")) {
      clearSessionData();
      setText(""); // Clear the textarea
      setLtIssues([]); // Clear grammar issues
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
                <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs">
                  LT Only
                </span>
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

            {/* Simple token display */}
            <div className="mt-3 flex flex-wrap gap-1 p-3 rounded-2xl bg-muted/40">
              {displayTokens.map((tok, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded px-2 py-1 text-sm border bg-slate-50 text-slate-700 border-slate-200"
                >
                  {tok.raw}
                </span>
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
              <InfractionList items={infractions} />
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
