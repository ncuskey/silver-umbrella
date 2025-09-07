import type { LtIssue } from "./types";

// tolerant field shims
export const ltRuleId   = (i: any) => (i.ruleId ?? i.rule?.id ?? i.id ?? "").toString();
export const ltCategory = (i: any) => (i.categoryId ?? i.rule?.category?.id ?? i.category ?? "").toString();
export const ltOffset   = (i: any) => typeof i.offset === "number" ? i.offset
  : typeof i.fromPos === "number" ? i.fromPos
  : typeof i.context?.offset === "number" ? i.context.offset : -1;
export const ltLength   = (i: any) => typeof i.length === "number" ? i.length
  : typeof i.len === "number" ? i.len
  : typeof i.context?.length === "number" ? i.context.length : 0;
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

export function filterTerminalIssues(issues: LtIssue[]): LtIssue[] {
  return (issues ?? []).filter(i => KEEP.has(ltRuleId(i)));
}
