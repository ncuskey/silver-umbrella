"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, ListChecks, Settings } from "lucide-react";
import type { Token as LibToken, VirtualTerminalInsertion } from "@/lib/types";
import { checkWithLanguageTool } from "@/lib/gbClient";
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

// OCR types and helpers
type OcrBBox = { x0: number; y0: number; x1: number; y1: number };

type OcrWordSpan = {
  text: string;
  start: number;
  end: number;
  pageIndex: number;
  bbox: OcrBBox;
  confidence?: number | null;
};

type OcrData = {
  text: string;
  pages: { imageSrc: string | null }[];
  words: OcrWordSpan[];
  confidence: number | null;
  engine?: string;
};

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
    'ring-1 ring-offset-1 ring-offset-white',
    STATUS_CLS[status],
    selected ? 'ring-2' : ''
  ].join(' ');
}

// Caret pill styling: smaller padding and no ring offset to avoid overlapping the first character
function caretCls(status: 'ok'|'maybe'|'bad', selected: boolean) {
  return [
    'inline-flex items-center rounded-xl px-1.5 py-0.5 leading-6',
    'ring-1',
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
// Tiny placeholder packs; in production, rely on LanguageTool/fixer for spell checking
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
  const [loadedMeta, setLoadedMeta] = useState<{ id: string; student?: string|null; submitted_at?: string|null; duration_seconds?: number|null } | null>(null);
  const loadedOnceRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>("");
  const [ocrError, setOcrError] = useState<string>("");
  const [ocr, setOcr] = useState<OcrData | null>(null);
  const ocrPageImagesRef = useRef<(HTMLImageElement|null)[]>([]);
  const [savingSample, setSavingSample] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");

  // Load recent submissions for dropdown
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setSubsLoading(true);
        const res = await fetch('/api/submissions');
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setSubmissions(Array.isArray(data.items) ? data.items : []);
      } finally {
        setSubsLoading(false);
      }
    })();
    return () => { alive = false };
  }, []);

  // ———————————— OCR Helpers (Images + PDF) ————————————
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  function mapWordsFromResponse(rawWords: any, offset: number, pageIndex: number): OcrWordSpan[] {
    if (!Array.isArray(rawWords)) return [];
    return rawWords
      .map((w) => {
        const text = typeof w?.text === 'string' ? w.text : '';
        if (!text) return null;
        const start = Number.isFinite(w?.start) ? Number(w.start) + offset : null;
        const end = Number.isFinite(w?.end) ? Number(w.end) + offset : (start != null ? start + text.length : null);
        if (start == null || end == null) return null;
        const bboxRaw = w?.bbox ?? {};
        const bbox: OcrBBox = {
          x0: Number.isFinite(bboxRaw?.x0) ? Number(bboxRaw.x0) : 0,
          y0: Number.isFinite(bboxRaw?.y0) ? Number(bboxRaw.y0) : 0,
          x1: Number.isFinite(bboxRaw?.x1) ? Number(bboxRaw.x1) : 0,
          y1: Number.isFinite(bboxRaw?.y1) ? Number(bboxRaw.y1) : 0,
        };
        return {
          text,
          start,
          end,
          pageIndex,
          bbox,
          confidence: typeof w?.confidence === 'number' ? w.confidence : null,
        } as OcrWordSpan;
      })
      .filter((w): w is OcrWordSpan => !!w);
  }

  async function ocrImage(file: File): Promise<{ text: string; ocr: OcrData | null }> {
    setOcrStatus('Preparing image…');
    const dataUrl = await fileToBase64(file);
    setOcrStatus('Uploading image…');
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: dataUrl, lang: 'en' })
    });
    if (!res.ok) throw new Error(`OCR failed (${res.status})`);
    const json = await res.json();
    const textResp: string = (json?.text ?? '').trim();
    const preSrc: string | null = json?.preprocessedImageBase64 ?? null;
    const words = mapWordsFromResponse(json?.words ?? [], 0, 0);
    const ocr: OcrData = {
      text: textResp,
      pages: [{ imageSrc: preSrc }],
      words,
      confidence: typeof json?.confidence === 'number' ? json.confidence : null,
      engine: json?.engine || 'tesseract',
    };
    return { text: textResp, ocr };
  }

  async function renderPdfToCanvases(file: File): Promise<HTMLCanvasElement[]> {
    const pdfjsLib: any = await import('pdfjs-dist/build/pdf');
    // Serve worker and its relative imports from same-origin route to avoid CORS/module issues
    if (pdfjsLib?.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    }
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const canvases: HTMLCanvasElement[] = [];
    const scale = 2.0;
    for (let p = 1; p <= pdf.numPages; p++) {
      setOcrStatus(`Rendering page ${p}/${pdf.numPages}…`);
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      canvases.push(canvas);
    }
    return canvases;
  }

  function canvasToDataURL(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL('image/png');
  }

  async function ocrPdf(file: File): Promise<{ text: string; ocr: OcrData | null }> {
    const canvases = await renderPdfToCanvases(file);
    const texts: string[] = [];
    const pages: { imageSrc: string | null }[] = [];
    const allWords: OcrWordSpan[] = [];
    let confidenceSum = 0;
    let confidenceCount = 0;
    let offset = 0;
    for (let i = 0; i < canvases.length; i++) {
      setOcrStatus(`Uploading page ${i + 1}/${canvases.length}…`);
      const dataUrl = canvasToDataURL(canvases[i]);
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, lang: 'en' })
      });
      if (!res.ok) throw new Error(`OCR failed on page ${i + 1} (${res.status})`);
      const json = await res.json();
      const pageText = (json?.text ?? '').trim();
      texts.push(pageText);
      const preSrc: string | null = json?.preprocessedImageBase64 ?? null;
      pages.push({ imageSrc: preSrc });
      const words = mapWordsFromResponse(json?.words ?? [], offset, i);
      for (const span of words) allWords.push(span);
      if (typeof json?.confidence === 'number') {
        confidenceSum += json.confidence;
        confidenceCount += 1;
      }
      offset += pageText.length + 2; // for the join with \n\n
    }
    const combined = texts.filter(Boolean).join('\n\n');
    const avgConfidence = confidenceCount ? confidenceSum / confidenceCount : null;
    const ocr: OcrData = {
      text: combined,
      pages,
      words: allWords,
      confidence: avgConfidence,
      engine: 'tesseract',
    };
    return { text: combined, ocr };
  }

  const onSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFilePicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Reset the input so the same file can be reselected later
    e.target.value = '';
    if (!f) return;
    setOcrBusy(true);
    setOcrError('');
    setOcrStatus('Preparing…');
    try {
      const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
      const result = isPdf ? await ocrPdf(f) : await ocrImage(f);
      setText(result.text);
      setOcr(result.ocr);
      // preload OCR page images for cropping
      ocrPageImagesRef.current = [];
      if (result.ocr && result.ocr.pages) {
        for (let i = 0; i < result.ocr.pages.length; i++) {
          const src = result.ocr.pages[i].imageSrc;
          if (!src) { ocrPageImagesRef.current[i] = null; continue; }
          const img = new Image();
          img.src = src;
          await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
          ocrPageImagesRef.current[i] = img;
        }
      }
      setOcrStatus('Done');
    } catch (err: any) {
      setOcrError(err?.message || String(err));
    } finally {
      setOcrBusy(false);
      setTimeout(() => setOcrStatus(''), 1500);
    }
  }, []);

  async function loadSubmission(id: string) {
    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.content) {
        setText(data.content);
        const durSec = typeof data.duration_seconds === 'number' ? data.duration_seconds : null;
        setLoadedMeta({ id, student: data.student_name ?? null, submitted_at: data.submitted_at ?? null, duration_seconds: durSec });
        setSelectedSubmissionId(id);
        setUi(prev => {
          const minutes = durSec ? durSec / 60 : 0;
          return {
            ...prev,
            minutes,
            kpis: computeKpis(prev.tokens, minutes, prev.caretStates)
          };
        });
      }
    } catch {}
  }

  // If a submission ID is present in the URL, load it and replace text
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loadedOnceRef.current) return;
    const params = new URLSearchParams(location.search);
    const id = params.get('submission');
    if (!id) return;
    loadedOnceRef.current = true;
    loadSubmission(id);
  }, []);
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
      return caretCls(state, selected);
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
        className={
          clsForCell(c) +
          ' tt cursor-pointer relative group ' +
          (c.kind === 'token'
            ? 'word-pill hover:z-50 focus:z-50'
            : 'caret-pill')
        }
        data-tip={
          c.kind === 'token' ? (tooltipForToken((c as any).ti) || undefined)
          : tipForCaret((c as any).bi)
        }
        aria-pressed={
          c.kind === 'token'
            ? isSel('token', (c as any).ti)
            : (focus?.type === 'caret' && focus.index === (c as any).bi) || undefined
        }
        onMouseEnter={c.kind === 'token' ? () => { ensureCropForToken((c as any).ti); } : undefined}
      >
        {/* token text or caret glyph */}
        {c.kind === 'caret'
          ? '^'
          : (() => {
              const t: any = displayTokens[c.ti];
              // Use original source text slice for maximum fidelity,
              // falling back to token.raw when offsets are missing.
              const fromSource =
                typeof t.start === 'number' && typeof t.end === 'number'
                  ? text.slice(t.start, t.end)
                  : t.raw;
              const txt = t.overlay ?? fromSource ?? '';
              return txt;
            })()
        }
        {c.kind === 'token' && tokenCrops[(c as any).ti] ? (
          <span className="pointer-events-none absolute left-0 top-[110%] z-50 hidden group-hover:block">
            <span className="inline-block rounded-md border border-slate-200 bg-white shadow-md p-1 max-w-[260px]">
              <img src={tokenCrops[(c as any).ti]} alt="Scanned word" className="max-w-[240px] h-auto block" />
            </span>
          </span>
        ) : null}
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
  
  // Grammar service settings state
  const [showSettings, setShowSettings] = useState(false);
  const [showCapitalizationFixes, setShowCapitalizationFixes] = useState(true);
  const lastCheckedText = useRef<string>("");    // to avoid duplicate checks
  const grammarRunId = useRef<number>(0);        // cancellation token for in-flight checks

  // Simple grammar mode label
  const grammarModeLabel = "LT + Llama";
  
  // Submissions (load and select)
  const [submissions, setSubmissions] = useState<Array<{ id: string; student_name: string|null; submitted_at: string|null; duration_seconds: number|null }>>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("");

  // Single UI state object with KPIs
  // caretBad is derived from VT insertions; initialize empty set
  const [ui, setUi] = useState({
    tokens: tokenModels,
    minutes: 0,
    caretStates: {} as Record<number, 'ok'|'maybe'|'bad'>,
    manualCaretOverrides: new Set<number>() as Set<number>,
    removedCarets: new Set<number>() as Set<number>,
    kpis: computeKpis(tokenModels, 0, {})
  });

  // Update UI state when tokenModels or terminalGroups change
  useEffect(() => {
    setUi(prev => ({
      ...prev,
      tokens: tokenModels,
      kpis: computeKpis(tokenModels, prev.minutes, prev.caretStates)
    }));
  }, [tokenModels]);

// Complex functions removed - using LT-only approach

  // Complex WSC/CWS computation removed - using LT-only approach

  const lexicon = useMemo(() => buildLexicon(selectedPacks, ""), [selectedPacks]);
  
  const tokens = useMemo<LibToken[]>(() => tokenize(text), [text]);


  useEffect(() => {
    let alive = true;
    (async () => {
      const resp = await checkWithLanguageTool(text);
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
  
  // Hover image (scanned word snippet) cache and generator
  const [tokenCrops, setTokenCrops] = useState<Record<number, string>>({});
  const ensureCropForToken = useCallback(async (ti: number) => {
    if (!ocr || tokenCrops[ti]) return;
    const t = displayTokens[ti] as any;
    if (!t) return;
    const rawWord = String(t.raw || '');
    if (!/^[A-Za-z][A-Za-z'’-]*$/.test(rawWord)) return; // words only
    const start = typeof t.start === 'number' ? t.start : null;
    const end = typeof t.end === 'number' ? t.end : null;
    if (start == null || end == null) return;
    // choose OCR word with max overlap
    let best: OcrWordSpan | null = null;
    let bestOverlap = 0;
    for (const w of ocr.words) {
      const overlap = Math.max(0, Math.min(end, w.end) - Math.max(start, w.start));
      if (overlap > bestOverlap) { bestOverlap = overlap; best = w; }
    }
    if (!best || bestOverlap <= 0) return;
    const pageImg = ocrPageImagesRef.current[best.pageIndex] || null;
    if (!pageImg) return;
    const { x0, y0, x1, y1 } = best.bbox;
    const pad = 4;
    const sx = Math.max(0, Math.min(pageImg.naturalWidth, Math.floor(x0 - pad)));
    const sy = Math.max(0, Math.min(pageImg.naturalHeight, Math.floor(y0 - pad)));
    const sw = Math.max(1, Math.min(pageImg.naturalWidth - sx, Math.ceil(x1 - x0 + pad * 2)));
    const sh = Math.max(1, Math.min(pageImg.naturalHeight - sy, Math.ceil(y1 - y0 + pad * 2)));
    const maxW = 240;
    const scale = Math.min(1, maxW / sw);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = dw; canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(pageImg, sx, sy, sw, sh, 0, 0, dw, dh);
    const url = canvas.toDataURL('image/png');
    setTokenCrops(prev => ({ ...prev, [ti]: url }));
  }, [ocr, displayTokens, tokenCrops]);
  // Detect LanguageTool/fixer availability/error from client response
  const gbError: string | null = useMemo(() => {
    const anyGb = gb as any;
    if (!anyGb) return null;
    if (typeof anyGb.status === 'number' && anyGb.status >= 400) {
      return anyGb.error || `LanguageTool fixer error (${anyGb.status})`;
    }
    if (!Array.isArray(anyGb.edits)) return 'LanguageTool fixer unavailable (no edits)';
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

  // Build final output text from the fixer/LanguageTool correction
  const finalOutputText = useMemo(() => {
    // Prefer `fixed` (or `correction`) from the fixer service when available
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

    // Build list of visible word indices (skip punctuation/hidden tokens)
    const visibleWordIdxs: number[] = [];
    for (let i = 0; i < N; i++) {
      if (ui.tokens[i]?.removed) continue;
      const t = displayTokens[i] as any;
      if (t?.type === 'WORD') visibleWordIdxs.push(i);
    }

    // Nothing visible → nothing to render
    if (!visibleWordIdxs.length) return cells;

    const pushCaret = (bi: number) => {
      if (ui.removedCarets?.has(bi)) return;
      const cState = ui.caretStates[bi] ?? 'ok';
      const sev: 'correct'|'possible'|'incorrect' = cState === 'bad' ? 'incorrect' : cState === 'maybe' ? 'possible' : 'correct';
      cells.push({ kind: 'caret', bi: bi, ui: sev });
    };

    // Render as: v0 [^ between v0|v1] v1 [^ between v1|v2] ... [^ after last]
    const first = visibleWordIdxs[0];
    // Initial boundary caret before the first visible word
    pushCaret(first);
    // Then the first word
    cells.push({ kind: 'token', ti: first, ui: (displayTokens[first] as any).ui });
    for (let k = 1; k < visibleWordIdxs.length; k++) {
      const i = visibleWordIdxs[k];
      pushCaret(i);                 // caret between previous and this visible word (boundary = i)
      cells.push({ kind: 'token', ti: i, ui: (displayTokens[i] as any).ui });
    }

    // Final caret after the last visible word (boundary = lastIndex + 1)
    const last = visibleWordIdxs[visibleWordIdxs.length - 1];
    pushCaret(last + 1);

    return cells;
  }, [displayTokens, ui.tokens, ui.caretStates, ui.removedCarets]);

  // Clear cached crops if text diverges from OCR baseline
  useEffect(() => {
    if (ocr && ocr.text !== text) {
      setTokenCrops({});
    }
  }, [text, ocr]);

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

  const llamaVerdict = useMemo(() => (gb?.llamaVerdict ?? null) as (typeof gb & { llamaVerdict?: any })['llamaVerdict'], [gb]);
  const llamaSummary = useMemo(() => {
    if (!llamaVerdict || llamaVerdict.status !== 'ok') return null;
    const decisions = Array.isArray(llamaVerdict.decisions) ? llamaVerdict.decisions : [];
    const flagged = decisions.filter((d: any) => d && d.keep === false);
    return { decisions, flagged };
  }, [llamaVerdict]);

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

  const persistSample = useCallback(async () => {
    if (!text.trim()) {
      setSaveMessage('Enter sample text first');
      setTimeout(() => setSaveMessage(''), 2500);
      return;
    }
    setSavingSample(true);
    try {
      const payload = {
        source: ocr ? 'ocr' : 'manual',
        originalText: text,
        fixedText: gb?.correction ?? null,
        grammarEdits: gb?.edits ?? [],
        llamaVerdict: llamaVerdict ?? null,
        metrics: {
          tww: kpis.tww,
          wsc: kpis.wsc,
          cws: kpis.cws,
          eligible: kpis.eligible,
          minutes: ui.minutes ?? null,
        },
      };
      const res = await fetch('/api/generator/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Save failed (${res.status}) ${body ? '- ' + body : ''}`.trim());
      }
      const data = await res.json().catch(() => ({}));
      const id = data?.id ? `#${data.id}` : '✓';
      setSaveMessage(`Saved sample ${id}`);
    } catch (err: any) {
      setSaveMessage(err?.message || 'Save failed');
    } finally {
      setSavingSample(false);
      setTimeout(() => setSaveMessage(''), 4000);
    }
  }, [text, gb, llamaVerdict, kpis, ui.minutes, ocr]);

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
        {loadedMeta && (
          <div className="mb-4 p-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            Loaded submission {loadedMeta.id}
            {loadedMeta.student ? ` · ${loadedMeta.student}` : ''}
            {loadedMeta.submitted_at ? ` · ${new Date(loadedMeta.submitted_at).toLocaleString()}` : ''}
            {typeof loadedMeta.duration_seconds === 'number' ? ` · ${String(Math.floor((loadedMeta.duration_seconds||0)/60)).padStart(2,'0')}:${String((loadedMeta.duration_seconds||0)%60).padStart(2,'0')}` : ''}
          </div>
        )}
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
            {/* Student writing textarea + Load Scan button */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Paste student writing</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg,image/webp,image/bmp,image/tiff,image/gif"
                    className="hidden"
                    onChange={onFilePicked}
                  />
                  <button
                    type="button"
                    onClick={onSelectFileClick}
                    className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-white hover:bg-slate-700"
                    title="Load a scan (PDF/PNG/JPG) and OCR it"
                  >
                    Load Scan (PDF/PNG/JPG)
                  </button>
                </div>
              </div>
              <Textarea className="min-h-[160px] mt-1" value={text} onChange={(e) => setText(e.target.value)} />
              {(ocrBusy || ocrError || ocrStatus) && (
                <div className="mt-2 text-xs">
                  {ocrBusy && (
                    <span className="inline-block mr-2 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border">OCR…</span>
                  )}
                  {ocrStatus && (
                    <span className="text-slate-600">{ocrStatus}</span>
                  )}
                  {ocrError && (
                    <span className="ml-2 text-red-600">{ocrError}</span>
                  )}
                </div>
              )}
            </div>

            {gbError && (
              <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900">
            Grammar assistant unavailable: {gbError}. Ensure FIXER_URL and LT_BASE_URL point at the stack services.
              </div>
            )}

            {/* Single-line controls: load submission + color key */}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Load submission</span>
                <select
                  className="h-8 min-w-[12rem] rounded border px-2 text-sm"
                  value={selectedSubmissionId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    loadSubmission(id);
                  }}
                >
                  <option value="" disabled>{subsLoading ? 'Loading…' : 'Select…'}</option>
                  {submissions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.student_name || 'Unnamed')} · {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}
                    </option>
                  ))}
                </select>
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
            <div className="flex flex-wrap items-center gap-2">
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
              <button
                onClick={persistSample}
                disabled={savingSample}
                className={cn(
                  'px-3 py-1 text-sm rounded transition-colors border border-emerald-300',
                  savingSample ? 'bg-emerald-100 text-emerald-600 opacity-70 cursor-not-allowed' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                )}
              >
                {savingSample ? 'Saving…' : 'Save sample to SQL'}
              </button>
              {saveMessage && (
                <span className="text-xs text-slate-600">
                  {saveMessage}
                </span>
              )}
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
                sub={ui.minutes ? `${String(Math.floor(ui.minutes)).padStart(2,'0')}:${String(Math.round((ui.minutes*60)%60)).padStart(2,'0')} timed` : "no duration"}
              />
            </div>

            {/* Output text with removed tokens (no auto-inserted punctuation) */}
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-sm font-medium text-blue-800 mb-1">Output Text</div>
              <div className="text-sm text-blue-700 whitespace-pre-wrap break-words">{finalOutputText}</div>
            </div>

            {llamaVerdict && (
              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/70">
                <div className="flex items-center justify-between text-sm font-medium text-emerald-800">
                  <span>LLM sanity check</span>
                  <span className="text-xs uppercase tracking-wide">Llama</span>
                </div>
                <div className="mt-1 text-xs text-emerald-900 space-y-1">
                  {llamaVerdict.status === 'error' && (
                    <div className="text-red-600">LLM error: {llamaVerdict.error || 'unknown error'}</div>
                  )}
                  {llamaVerdict.status === 'skipped' && (
                    <div>No sanity check run (no edits detected).</div>
                  )}
                  {llamaVerdict.status === 'ok' && llamaSummary && llamaSummary.decisions.length > 0 && (
                    <div>
                      <div className="font-medium">
                        {llamaSummary.flagged.length === 0
                          ? 'All suggested edits look reasonable.'
                          : `${llamaSummary.flagged.length} edit${llamaSummary.flagged.length === 1 ? '' : 's'} flagged for review.`}
                      </div>
                      {llamaSummary.flagged.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {llamaSummary.flagged.slice(0, 5).map((d: any) => (
                            <li key={d.index} className="pl-2 border-l-2 border-amber-400 text-amber-800">
                              Edit #{d.index + 1}: {d.reason || 'Review manually.'}
                            </li>
                          ))}
                          {llamaSummary.flagged.length > 5 && (
                            <li className="text-emerald-700">…and {llamaSummary.flagged.length - 5} more.</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                  {llamaVerdict.status === 'ok' && (!llamaSummary || llamaSummary.decisions.length === 0) && (
                    <div>No LLM feedback returned.</div>
                  )}
                </div>
              </div>
            )}

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
            <li><strong>WSC</strong>: each correctly spelled word in isolation (override by clicking). Uses LanguageTool + fixer service for spell checking; otherwise, a custom-lexicon fallback is used.</li>
            <li><strong>CWS</strong>: adjacent units (words & essential punctuation). Commas excluded. Initial valid word counts 1. Capitalize after terminals.</li>
          </ul>
        </div>

        {/* Privacy Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Privacy:</span>
              <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                LanguageTool, Tesseract & Llama (Docker stack)
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
              <li><strong>Extensibility</strong>: uses LanguageTool + fixer for spell checking; add POS-based rules if desired.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
