import { describe, it, expect } from "vitest";
import { convertLTTerminalsToInsertions } from "@/lib/cws-lt";

// simple tokenizer copy from page.tsx to keep test self-contained
function tokenizeWithOffsets(text: string) {
  const out: any[] = []; let idx = 0;
  const re = /\w+|[^\s\w]/g;
  for (const m of text.matchAll(re)) {
    const start = m.index!, end = start + m[0].length;
    out.push({ idx, raw: m[0], type: /\w/.test(m[0][0]) ? "WORD":"PUNCT", start, end }); idx++;
  }
  return out;
}

describe("LT-only caret placement", () => {
  it("places boundary before the capitalized word for UPPERCASE_SENTENCE_START", () => {
    const text = "… of the forest The water …";
    const tokens = tokenizeWithOffsets(text);

    // mock the single LT issue we care about
    const issues = [{
      offset: text.indexOf("The"),
      length: "The".length,
      rule: {
        id: "UPPERCASE_SENTENCE_START"
      },
      categoryId: "CASING",
      message: "Capitalization",
      replacements: [] as string[],
    }];

    const ins = convertLTTerminalsToInsertions(tokens, issues as any);
    // find token index of "forest"
    const forestIdx = tokens.find((t:any) => t.raw === "forest")!.idx;
    expect(ins.length).toBeGreaterThan(0);
    expect(ins[0].beforeBIndex).toBe(forestIdx); // dot goes AFTER "forest" (i.e., before "The")
  });
});
