// lib/computeKpis.ts
import type { Status } from "@/components/TerminalGroup";
import type { TokenModel } from "@/components/Token";
import type { TerminalGroupModel } from "@/components/TerminalGroup";

type T = TokenModel;
type G = TerminalGroupModel;

export function computeKpis(tokens: T[], groups: G[], minutes: number) {
  const words = tokens.filter(t => t.kind === "word");
  const tww = words.length;

  // Words Spelled Correctly = words not currently marked bad
  const spelledBad = words.filter(w => w.state === "bad").length;
  const wsc = tww - spelledBad;

  // Build an interleaved sequence of items (word or terminal group) for CWS
  const byAnchor = new Map(groups.map(g => [g.anchorIndex, g]));
  const items: Status[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === "word") items.push(tokens[i].state as Status);
    const g = byAnchor.get(i + 1);
    if (g) items.push(g.status);
  }

  let eligible = 0, cws = 0;
  for (let i = 0; i < items.length - 1; i++) {
    eligible++;
    if (items[i] === "ok" && items[i + 1] === "ok") cws++;
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
