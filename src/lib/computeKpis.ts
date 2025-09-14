// lib/computeKpis.ts
import type { TokenModel } from "@/components/Token";

type T = TokenModel;

// caretStates: record of boundary index -> ('ok' | 'maybe' | 'bad')
// Only 'bad' blocks a CWS boundary; 'ok' and 'maybe' still count as eligible.
export function computeKpis(tokens: T[], minutes: number, caretStates: Record<number, 'ok'|'maybe'|'bad'>) {
  // Consider only visible words (not removed)
  const words = tokens.filter(t => t.kind === "word" && !(t as any).removed);
  const tww = words.length;

  // Words Spelled Correctly = words not currently marked bad
  const spelledBad = words.filter(w => w.state === "bad").length;
  const wsc = tww - spelledBad;

  // Eligible boundaries = between two visible words
  let eligible = 0, cws = 0;
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    const aWord = a && a.kind === 'word' && !(a as any).removed;
    const bWord = b && b.kind === 'word' && !(b as any).removed;
    if (!aWord || !bWord) continue;
    eligible++;
    const aOk = a.state === 'ok';
    const bOk = b.state === 'ok';
    const boundaryIdx = i + 1;
    const caretState = caretStates[boundaryIdx] ?? 'ok';
    const caretOk = caretState !== 'bad';
    if (aOk && bOk && caretOk) cws++;
  }

  const pct = eligible ? Math.round((cws / eligible) * 100) : 0;
  const perMin = minutes ? +(cws / minutes).toFixed(1) : 0;

  return {
    tww,
    wsc,
    cws,
    eligible,
    pctCws: pct,
    cwsPerMin: perMin,
  };
}
