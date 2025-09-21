import { buildLtMatchId, type LtMatch, type LtResponse } from "./ltClient";

export type TokenHint = {
  start: number;
  end: number;
  label: string;
  ruleId: string;
  matchId?: string;
  source?: "LT" | "AUDIT_LT" | "AUDIT_MISSED";
  audit?: {
    decision?: string;
    reason?: string;
    suggestion?: string;
  };
};

const DEFAULT_LABEL = "LanguageTool suggestion";

export function ltToTokens(resp: LtResponse | null | undefined): TokenHint[] {
  if (!resp || !Array.isArray(resp.matches)) return [];

  return resp.matches
    .map((match, index) => {
      if (!match || typeof match.offset !== "number" || typeof match.length !== "number") {
        return null;
      }

      const start = Math.max(0, match.offset);
      const end = Math.max(start, start + Math.max(0, match.length));

      const rawLabel = typeof match.message === "string" ? match.message.trim() : "";
      const ruleDescription = typeof match.rule?.description === "string" ? match.rule.description.trim() : "";
      const label = rawLabel || ruleDescription || DEFAULT_LABEL;
      const ruleId = typeof match.rule?.id === "string" ? match.rule.id : "LT_RULE";
      const matchId = buildLtMatchId(match, index);

      return { start, end, label, ruleId, matchId, source: "LT" } satisfies TokenHint;
    })
    .filter(Boolean) as TokenHint[];
}
