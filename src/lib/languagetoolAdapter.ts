import type { LtResponse } from "./ltClient";

export type TokenHint = {
  start: number;
  end: number;
  label: string;
  ruleId: string;
};

const DEFAULT_LABEL = "LanguageTool suggestion";

export function ltToTokens(resp: LtResponse | null | undefined): TokenHint[] {
  if (!resp || !Array.isArray(resp.matches)) return [];

  return resp.matches
    .map((match) => {
      if (!match || typeof match.offset !== "number" || typeof match.length !== "number") {
        return null;
      }

      const start = Math.max(0, match.offset);
      const end = Math.max(start, start + Math.max(0, match.length));

      const rawLabel = typeof match.message === "string" ? match.message.trim() : "";
      const ruleDescription = typeof match.rule?.description === "string" ? match.rule.description.trim() : "";
      const label = rawLabel || ruleDescription || DEFAULT_LABEL;
      const ruleId = typeof match.rule?.id === "string" ? match.rule.id : "LT_RULE";

      return { start, end, label, ruleId } satisfies TokenHint;
    })
    .filter(Boolean) as TokenHint[];
}
