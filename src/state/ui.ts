// state/ui.ts
import { computeKpis } from "@/lib/computeKpis";
import type { TokenModel } from "@/components/Token";

// This module is deprecated after removing terminal groups.
// Kept as a stub to avoid import errors if referenced elsewhere.
export interface UIState {
  tokens: TokenModel[];
  minutes: number;
  caretBad: Set<number>;
  kpis: ReturnType<typeof computeKpis>;
}

export function noop() {}
