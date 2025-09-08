// state/ui.ts
import { cycle } from "@/components/TerminalGroup";
import { computeKpis } from "@/lib/computeKpis";
import type { TokenModel } from "@/components/Token";
import type { TerminalGroupModel } from "@/components/TerminalGroup";

export interface UIState {
  tokens: TokenModel[];
  terminalGroups: TerminalGroupModel[];
  minutes: number;
  kpis: ReturnType<typeof computeKpis>;
}

export function toggleToken(
  id: string,
  setUi: React.Dispatch<React.SetStateAction<UIState>>
) {
  setUi(prev => {
    const tokens = prev.tokens.map(t =>
      t.id === id ? { ...t, state: cycle(t.state as any) } : t
    );
    const kpis = computeKpis(tokens, prev.terminalGroups, prev.minutes);
    console.log("[KPIS] after token toggle", kpis);
    return { ...prev, tokens, kpis };
  });
}

export function toggleTerminalGroup(
  id: string,
  setUi: React.Dispatch<React.SetStateAction<UIState>>
) {
  setUi(prev => {
    const terminalGroups = prev.terminalGroups.map(g =>
      g.id === id ? { ...g, status: cycle(g.status) } : g
    );
    const kpis = computeKpis(prev.tokens, terminalGroups, prev.minutes);
    console.log("[KPIS] after tg toggle", kpis);
    return { ...prev, terminalGroups, kpis };
  });
}
