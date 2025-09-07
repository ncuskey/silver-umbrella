import { describe, it, expect } from "vitest";
import { ltIssuesToInsertions } from "@/lib/ltToVT";

const toks = (text: string) => {
  const out: any[] = []; let idx = 0;
  const re = /\^|\w+|[^\s\w]/g; // include caret
  for (const m of text.matchAll(re)) {
    const start = m.index!, end = start + m[0].length;
    const raw = m[0];
    out.push({ idx: idx++, raw, start, end,
      type: raw==="^"?"BOUNDARY":(/\w/.test(raw)?"WORD":"PUNCT")
    });
  }
  return out;
};

it("inserts dot before capitalized start (UPPERCASE_SENTENCE_START)", () => {
  const text = "It was dark ^ nobody could";
  const tokens = toks(text);
  const issues = [{ id: "UPPERCASE_SENTENCE_START", offset: text.indexOf("nobody") }];
  const ins = ltIssuesToInsertions(text, tokens, issues as any);
  expect(ins.length).toBe(1);
  // dot goes after "dark", ownership is the caret before "nobody"
  const dark = tokens.find(t => t.raw === "dark");
  const caret = tokens.find((t,i) => t.raw==="^" && tokens[i+1]?.raw==="nobody");
  expect(ins[0].at).toBe(dark.end);
  expect(ins[0].beforeBIndex).toBe(caret.idx);
});
