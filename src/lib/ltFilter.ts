import type { LtIssue } from "./types";

// Field shims so we handle all LT server shapes
export const ltRuleId   = (i: any) => (i.ruleId ?? i.rule?.id ?? i.id ?? "").toString();
export const ltCategory = (i: any) => (i.categoryId ?? i.rule?.category?.id ?? i.category ?? "").toString();
export const ltMsg      = (i: any) => (i.msg ?? i.message ?? "").toString();
export const ltOffset   = (i: any) => (typeof i.offset === "number" ? i.offset
                              : typeof i.fromPos === "number" ? i.fromPos
                              : typeof i.context?.offset === "number" ? i.context.offset
                              : -1);
export const ltLength   = (i: any) => (typeof i.length === "number" ? i.length
                              : typeof i.len === "number" ? i.len
                              : typeof i.context?.length === "number" ? i.context.length
                              : 0);
export const ltReps     = (i: any) => (Array.isArray(i.replacements) ? i.replacements : [])
  .map((r: any) => r?.value ?? r?.val ?? r?.text)
  .filter(Boolean);

export const ltMarked   = (i: any, text?: string) => {
  if (typeof i.text === "string") return i.text;
  if (typeof i.len === "string") return i.len; // some servers misuse `len`
  const off = ltOffset(i), len = ltLength(i);
  return (text && off >= 0 && len > 0) ? text.slice(off, off + len) : undefined;
};

// keep only rules that imply a sentence boundary
const KEEP = new Set([
  "UPPERCASE_SENTENCE_START",
  "MISSING_SENTENCE_TERMINATOR",
  "PUNCTUATION_PARAGRAPH_END"
]);

export function logAllLtIssues(issues: any[], fullText?: string) {
  if (!issues || !issues.length) {
    console.info("[LT] issues (empty)");
    return;
  }
  // Flat list
  console.info("[LT] issues (count)", issues.length);
  console.table(
    issues.map((i) => ({
      id: ltRuleId(i),
      category: ltCategory(i),
      msg: ltMsg(i),
      offset: ltOffset(i),
      length: ltLength(i),
      text:
        typeof (i as any).text === "string"
          ? (i as any).text
          : typeof (i as any).len === "string"
          ? (i as any).len // some servers stuff the matched text into `len`
          : (() => {
              const off = ltOffset(i), len = ltLength(i);
              return fullText && off >= 0 && len > 0 ? fullText.slice(off, off + len) : "";
            })(),
      reps: ltReps(i).join(" | "),
    }))
  );

  // Group by rule for a quick overview
  const byRule = issues.reduce((acc: Record<string, number>, i: any) => {
    const id = ltRuleId(i) || "(unknown)";
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
  console.info("[LT] by rule", byRule);
}

export function filterTerminalIssues(issues: LtIssue[]): LtIssue[] {
  return (issues ?? []).filter(i => KEEP.has(ltRuleId(i)));
}
