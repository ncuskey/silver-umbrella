"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, ListChecks } from "lucide-react";
import { setExternalSpellChecker, getExternalSpellChecker } from "@/lib/spell/bridge";
import type { GrammarIssue, SpellChecker } from "@/lib/spell/types";
import { buildCwsPairs, ESSENTIAL_PUNCT } from "@/lib/cws";
import type { CwsPair } from "@/lib/cws";
import { cn } from "@/lib/utils";

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

interface Token {
  raw: string;
  type: "WORD" | "PUNCT";
  idx: number; // global index in token stream
}

interface WordOverride { csw?: boolean }
interface PairOverride { cws?: boolean }
type PairOverrides = Record<number, { cws?: boolean }>; // key = bIndex (-1 or token index)

interface Infraction {
  kind: "definite" | "possible";
  tag: string; // e.g., SPELLING, CAPITALIZATION, TERMINAL, PAIR
  msg: string;
  at: number | string; // token idx or pair key
}

const WORD_RE = /^[A-Za-z]+(?:[-'’][A-Za-z]+)*$/;
const NUMERAL_RE = /^\d+(?:[\.,]\d+)*/;

// ———————————— Demo Dictionary Packs ————————————
// Tiny placeholder packs; in production, load larger dictionaries or WASM spellcheckers (Hunspell, etc.)
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

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /[A-Za-z]+(?:[-'’][A-Za-z]+)*|[\.!\?;:\u2014\u2013\-\(\)"'\u201C\u201D\u2018\u2019]|,|\d+(?:[\.,]\d+)*/g

  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const raw = m[0];
    const type: "WORD" | "PUNCT" =
      WORD_RE.test(raw) ? "WORD" : "PUNCT";
    tokens.push({ raw, type, idx: tokens.length });
  }
  return tokens;
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

function filterLtIssues(text: string, issues: GrammarIssue[], sc: SpellChecker | null, userLexicon: Set<string>) {
  const out: GrammarIssue[] = [];
  const seen = new Set<string>();

  const isWordOk = (w: string) => {
    if (sc) return sc.isCorrect(w);
    const base = w.replace(/[''']/g, "'").toLowerCase();
    return userLexicon.has(base) ||
           [base.replace(/(ing|ed|es|s)$/,''), base.replace(/(ly)$/,'')].some(s => s && userLexicon.has(s));
  };

  for (const m of issues) {
    const catId = (m.categoryId || "").toUpperCase();
    const ruleId = (m.ruleId || "").toUpperCase();
    const catName = (m.category || "").toUpperCase();
    const span = text.slice(m.offset, m.offset + m.length);
    const token = span.trim();

    // Only treat as spelling when LT says it's a true typo
    const isTypos = catId === "TYPOS" || ruleId.startsWith("MORFOLOGIK_RULE");
    if (isTypos) {
      if (token && !isWordOk(token)) {
        const k = `spell-${token}-${m.offset}`;
        if (!seen.has(k)) { out.push({ ...m, category: "SPELLING" }); seen.add(k); }
      }
      continue;
    }

    // Keep purely mechanical advice
    if (catName.includes("CAPITALIZATION") || catName.includes("PUNCTUATION") || catName.includes("TYPOGRAPHY")) {
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
function caretStateForBoundary(bIndex: number, cwsPairs: CwsPair[], pairOverrides: PairOverrides) {
  const pair = cwsPairs.find(p => p.bIndex === bIndex);
  if (!pair) return { eligible: false as const, ok: false as const, reason: "none" };

  const ov = pairOverrides[bIndex]?.cws;
  const ok = ov === true ? true : ov === false ? false : pair.valid;
  return { eligible: pair.eligible, ok, reason: pair.reason || "none" };
}

function toggleCaret(bIndex: number, pairOverrides: PairOverrides, setPairOverrides: React.Dispatch<React.SetStateAction<PairOverrides>>) {
  setPairOverrides(prev => {
    const ov = prev[bIndex]?.cws;
    const next = ov === true ? false : ov === false ? undefined : true; // cycle: default→true→false→default
    const clone = { ...prev };
    if (next === undefined) delete clone[bIndex];
    else clone[bIndex] = { cws: next };
    return clone;
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

function WritingScorer() {
  const [text, setText] = useState<string>(
    "It was dark. nobody could see the trees of the forest The Terrible Day\n\nI woud drink water from the ocean and I woud eat the fruit off of the trees Then I woud bilit a house out of trees and I woud gather firewood to stay warm I woud try and fix my boat in my spare time"
  );
  const [overrides, setOverrides] = useState<Record<string | number, WordOverride | PairOverride>>({});
  const [pairOverrides, setPairOverrides] = useState<PairOverrides>({});
  const [userLex, setUserLex] = useState<string>("ocean forest Terrible Day trees firewood bilit");
  const [packSel, setPackSel] = useState<string[]>(["us-k2", "us-k5", "general"]);
  const [showFlags, setShowFlags] = useState<boolean>(true);
  
  const [spellStatus, setSpellStatus] = useState<"loading" | "hunspell" | "demo" | "error">("loading");
  const [spellEpoch, setSpellEpoch] = useState(0);
  const spellCache = useRef<Map<string, boolean>>(new Map()); // if not already present

  const [ltBusy, setLtBusy] = useState(false);
  const [ltIssues, setLtIssues] = useState<GrammarIssue[]>([]);
  const [grammarStatus, setGrammarStatus] = useState<"idle"|"checking"|"ok"|"error">("idle");
  const [ltIsPublic, setLtIsPublic] = useState<boolean | null>(null);
  const lastCheckedText = useRef<string>("");    // to avoid duplicate checks
  const grammarRunId = useRef<number>(0);        // cancellation token for in-flight checks

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setSpellStatus("loading");
        const { createHunspellSpellChecker } = await import("@/lib/spell/hunspell-adapter");
        // Adjust these paths if your dicts live in a subfolder:
        const sc = await createHunspellSpellChecker("/dicts/en_US.aff", "/dicts/en_US.dic");
        if (!mounted) return;
        setExternalSpellChecker(sc);
        spellCache.current.clear();
        setSpellStatus("hunspell");
        setSpellEpoch((e) => e + 1);
        // Warm up cache with a few common words:
        ["the","and","because","friend","can't","we'll"].forEach(w => spellCache.current.set(w, sc.isCorrect(w)));
        console.log("[Hunspell] loaded ✓");
      } catch (e) {
        console.error("[Hunspell] load failed → falling back to demo lexicon", e);
        if (!mounted) return;
        setSpellStatus("demo");
      }
    })();
    return () => { mounted = false; };
  }, []);

  // place INSIDE WritingScorer(), after the autoload effect above
  useEffect(() => {
    const minChars = 24;  // don't run for very short snippets
    const trimmed = text.trim();
    if (trimmed.length < minChars) {
      setLtIssues([]);
      setGrammarStatus("idle");
      return;
    }
    // Skip if nothing changed
    if (trimmed === lastCheckedText.current) return;

    setGrammarStatus("checking");
    const myRun = ++grammarRunId.current;
    const handle = setTimeout(async () => {
      setLtBusy(true);
      try {
        const { createLanguageToolChecker } = await import("@/lib/grammar/languagetool-client");
        const lt = createLanguageToolChecker("/api/languagetool"); // use your proxy
        const issues = await lt.check(trimmed, "en-US");
        if (grammarRunId.current !== myRun) return;
        setLtIssues(issues);
        setLtIsPublic(lt.isPublic());
        setGrammarStatus("ok");
        lastCheckedText.current = trimmed;
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

  function isWordLikelyCorrect(word: string, userLexicon: Set<string>): boolean {
    if (!WORD_RE.test(word)) return false;
    const sc = getExternalSpellChecker();
    const key = `${sc ? "hun" : "demo"}:${word.toLowerCase()}`;
    const hit = spellCache.current.get(key);
    if (hit !== undefined) return hit;

    let ok: boolean;
    if (sc) {
      ok = sc.isCorrect(word);
    } else {
      const base = word.replace(/['']/g, "'").toLowerCase();
      ok = userLexicon.has(base) ||
           [base.replace(/(ing|ed|es|s)$/,''), base.replace(/(ly)$/,'')].some(s => s && userLexicon.has(s));
    }
    spellCache.current.set(key, ok);
    return ok;
  }

  function computeWSC(
    tokens: Token[],
    overrides: Record<number, WordOverride>,
    lexicon: Set<string>,
    infractions: Infraction[]
  ): number {
    let count = 0;
    tokens.forEach((t) => {
      if (t.type !== "WORD") return;
      const ok = isWordLikelyCorrect(t.raw, lexicon);
      // respect manual overrides if you support them:
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
    lexicon: Set<string>,
    infractions: Infraction[]
  ): number {
    const stream = tokens;
    const isValidWord = (t: Token) => t.type === "WORD" && ((overrides[t.idx as number] as WordOverride)?.csw ?? isWordLikelyCorrect(t.raw, lexicon));

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

      const wscFn = (w: string) => isWordLikelyCorrect(w, lexicon);
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

  const lexicon = useMemo(() => buildLexicon(packSel, userLex), [packSel, userLex]);
  
  // Add engine tag that changes when Hunspell loads
  const engineTag = spellStatus === "hunspell" ? "hun" : "demo";
  
  const tokens = useMemo(() => tokenize(text), [text, engineTag]);
  const stream = useMemo(() => tokens, [tokens, engineTag]);

  const cwsPairs = useMemo(() => {
    const sc = getExternalSpellChecker();
    const spell = (w: string) => sc ? sc.isCorrect(w) : isWordLikelyCorrect(w, lexicon);
    return buildCwsPairs(tokens, spell);
    // include engineTag so it recomputes when Hunspell loads
  }, [tokens, engineTag, lexicon]);

  const cwsCount = useMemo(() => {
    let n = 0;
    for (const p of cwsPairs) {
      if (!p.eligible) continue;
      const ov = pairOverrides[p.bIndex]?.cws;
      const ok = ov === true ? true : ov === false ? false : p.valid;
      if (ok) n++;
    }
    return n;
  }, [cwsPairs, pairOverrides]);

  const tww = useMemo(() => computeTWW(tokens), [tokens]);
  
  // Build filtered LT issues once
  const filteredLt = useMemo(
    () => filterLtIssues(text, ltIssues, getExternalSpellChecker(), lexicon),
    [text, ltIssues, engineTag] // include engineTag so Hunspell changes re-filter
  );
  
  const { wsc, cws, infractions } = useMemo(() => {
    const infractions: Infraction[] = [];
    const wsc = computeWSC(tokens, overrides as Record<number, WordOverride>, lexicon, infractions);
    const cws = computeCWS(tokens, overrides as Record<string, PairOverride | WordOverride>, lexicon, infractions);
    
    // Add CWS-specific infractions based on caret reasons
    for (const p of cwsPairs) {
      const ov = pairOverrides[p.bIndex]?.cws;
      const ok = ov === true ? true : ov === false ? false : p.valid;
      if (p.eligible && !ok) {
        if (p.reason === "capitalization") {
          infractions.push({ 
            kind: "definite", 
            tag: "CAPITALIZATION", 
            msg: "Expected capital after sentence-ending punctuation", 
            at: `${p.leftTok ?? "START"} ^ ${p.rightTok}` 
          });
        } else if (p.reason === "misspelling") {
          // spelling already appears under WSC, so usually skip duplicating
        }
      }
    }
    
    // Merge ONLY filteredLt into infractions
    for (const m of filteredLt) {
      infractions.push({ kind: "possible", tag: m.category.toUpperCase(), msg: m.message, at: `${m.offset}:${m.length}` });
    }
    
    return { wsc, cws, infractions };
  }, [tokens, overrides, lexicon, filteredLt, engineTag, cwsPairs, pairOverrides]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Written Expression (TWW, WSC, CWS) – with Flags</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Paste student writing</label>
            <Textarea className="min-h-[160px] mt-1" value={text} onChange={(e) => setText(e.target.value)} />

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Dictionary packs</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.keys(PACKS).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={packSel.includes(k) ? "default" : "outline"}
                      onClick={() =>
                        setPackSel((prev) => prev.includes(k) ? prev.filter((p) => p !== k) : [...prev, k])
                      }
                    >
                      {k}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Custom lexicon (semicolon/comma/space separated)</label>
                <Input className="mt-1" value={userLex} onChange={(e) => setUserLex(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <Checkbox id="flags" checked={showFlags} onCheckedChange={(v) => setShowFlags(!!v)} />
              <label htmlFor="flags" className="text-sm">Show infractions & suggestions</label>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button variant="secondary" onClick={() => { setOverrides({}); spellCache.current.clear(); }}>Reset overrides</Button>
              <Button variant="ghost" onClick={() => { setText(""); setLtIssues([]); lastCheckedText.current=""; }}>Clear text</Button>

              <div className="ml-auto flex items-center gap-2 text-xs">
                <span>Spell:</span>
                {spellStatus === "hunspell" && <Badge>Hunspell</Badge>}
                {spellStatus === "loading" && <Badge variant="secondary">loading…</Badge>}
                {spellStatus === "demo" && <Badge variant="secondary">demo lexicon</Badge>}
                {spellStatus === "error" && <Badge variant="destructive">error</Badge>}

                <span className="ml-3">Grammar:</span>
                {grammarStatus === "checking" && <Badge variant="secondary">checking…</Badge>}
                {grammarStatus === "ok" && <Badge>auto{ltIsPublic ? " (public)" : " (proxy)"}</Badge>}
                {grammarStatus === "idle" && <Badge variant="secondary">idle</Badge>}
                {grammarStatus === "error" && <Badge variant="destructive">error</Badge>}
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-2xl bg-white shadow-sm">
                <div className="text-xs text-muted-foreground">Total Words Written</div>
                <div className="text-2xl font-semibold">{tww}</div>
                <div className="text-[10px] text-muted-foreground">numerals excluded</div>
              </div>
              <div className="p-3 rounded-2xl bg-white shadow-sm">
                <div className="text-xs text-muted-foreground">Words Spelled Correctly</div>
                <div className="text-2xl font-semibold">{wsc}</div>
                <div className="text-[10px] text-muted-foreground">dictionary + overrides</div>
              </div>
              <div className="p-3 rounded-2xl bg-white shadow-sm">
                <div className="text-xs text-muted-foreground">Correct Writing Sequences</div>
                <div className="text-2xl font-semibold">{cwsCount}</div>
                <div className="text-[10px] text-muted-foreground">adjacent-unit pairs</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4" /> Click a <strong>word</strong> to toggle WSC; click the <strong>caret</strong> between tokens to toggle CWS.
            </div>

            <div className="mt-3 flex flex-wrap gap-1 p-3 rounded-2xl bg-muted/40">
              {/* initial caret uses bIndex = -1 */}
              {(() => {
                const { eligible, ok, reason } = caretStateForBoundary(-1, cwsPairs, pairOverrides);
                const muted = !eligible;
                return (
                  <button
                    type="button"
                    onClick={() => eligible && toggleCaret(-1, pairOverrides, setPairOverrides)}
                    title={
                      !eligible ? "Initial word is not a WORD unit"
                      : ok ? "CWS: counted (click to toggle)"
                      : reason === "capitalization" ? "CWS: needs capitalization"
                      : "CWS: blocked (spelling)"
                    }
                    className={
                      `mx-1 px-1 rounded ${muted ? "text-slate-300" : ok ? "bg-emerald-50 text-emerald-700" : "bg-red-100 text-red-700"}`
                    }
                  >
                    ^
                  </button>
                );
              })()}
              {tokens.map((tok, i) => {
                const isWordTok = tok.type === "WORD";
                const ok = isWordLikelyCorrect(tok.raw, lexicon);
                const ov = (overrides[tok.idx] as WordOverride)?.csw;
                const effectiveOk = ov === true ? true : ov === false ? false : ok;
                const bad = showFlags && isWordTok && !effectiveOk;
                
                const sc = getExternalSpellChecker();
                const sugg = (isWordTok && sc && !effectiveOk) ? (sc.suggestions?.(tok.raw, 3) || []) : [];
                const title = isWordTok
                  ? effectiveOk ? "WSC: counted (click to mark incorrect)"
                           : `WSC: NOT counted (click to mark correct)${sugg.length ? "\nSuggestions: " + sugg.join(", ") : ""}`
                  : tok.type;

                return (
                  <React.Fragment key={`tok-${i}`}>
                    {/* TOKEN */}
                    <button
                      className={cn(
                        "px-2 py-1 rounded-xl border transition-colors",
                        isWordTok
                          ? bad
                            ? "bg-red-100 text-red-700 border-red-300"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-50 text-slate-700 border-slate-200"
                      )}
                      title={title}
                      onClick={() => {
                        if (!isWordTok) return;
                        setOverrides((o) => ({ ...o, [tok.idx]: { ...(o[tok.idx] as WordOverride), csw: !(effectiveOk) } }));
                      }}
                    >
                      {tok.raw}
                    </button>

                    {/* CARET */}
                    {i < tokens.length - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const { eligible } = caretStateForBoundary(i, cwsPairs, pairOverrides);
                          if (eligible) toggleCaret(i, pairOverrides, setPairOverrides);
                        }}
                        title={
                          (() => {
                            const { eligible, ok, reason } = caretStateForBoundary(i, cwsPairs, pairOverrides);
                            return !eligible ? "Not counted for CWS (comma/quote/etc.)"
                            : ok ? "CWS: counted (click to toggle)"
                            : reason === "capitalization" ? "CWS: needs capitalization"
                            : "CWS: blocked (spelling)";
                          })()
                        }
                        className={
                          (() => {
                            const { eligible, ok } = caretStateForBoundary(i, cwsPairs, pairOverrides);
                            const muted = !eligible;
                            return `mx-1 px-1 rounded ${muted ? "text-slate-300" : ok ? "bg-emerald-50 text-emerald-700" : "bg-red-100 text-red-700"}`;
                          })()
                        }
                      >
                        ^
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {showFlags && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Infractions & Suggestions
                </h4>
                <InfractionList items={infractions} />
              </div>
            )}

            {/* somewhere under your scoring cards (simple readout) */}
            {filteredLt.length > 0 && (
              <div className="mt-3 text-xs p-2 rounded-xl border border-amber-300 bg-amber-50">
                <div className="font-medium mb-1">Grammar suggestions (advisory):</div>
                <ul className="list-disc ml-5 space-y-0.5">
                  {filteredLt
                    .slice(0, 12)
                    .map((i, idx) => <li key={idx}>{i.category}: {i.message}</li>)}
                </ul>
              </div>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">Sentence view</summary>
              <SentenceList text={text} />
            </details>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          <p className="font-medium">Scoring guidance</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>TWW</strong>: all words written; include misspellings; exclude numerals.</li>
            <li><strong>WSC</strong>: each correctly spelled word in isolation (override by clicking). Click 'Load Hunspell' to use a real dictionary/affix checker; otherwise, a custom-lexicon fallback is used.</li>
            <li><strong>CWS</strong>: adjacent units (words & essential punctuation). Commas excluded. Initial valid word counts 1. Capitalize after terminals.</li>
          </ul>
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
              <li><strong>Extensibility</strong>: replace <code>isWordSpelledCorrect</code> with Hunspell/LanguageTool adapters; add POS-based rules if desired.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
