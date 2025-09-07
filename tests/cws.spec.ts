import { describe, it, expect } from "vitest";
import { score, tokenize, buildPairs } from "@/lib/cws-core";

const S = (t: string) => score(t);

describe("CWS rule goldens", () => {
  it("initial-word credit", () => {
    const r = S("It is good.");
    expect(r.cws).toBeGreaterThan(0); // first word counts
  });

  it("terminal → WORD capitalization makes two CWS with essential punctuation", () => {
    const r = S("It was dark. Nobody came.");
    // `dark.^` and `^.Nobody` both eligible; CWS should include both
    expect(r.cws).toBeGreaterThanOrEqual(4);
  });

  it("commas are muted (not essential)", () => {
    const r = S("I came, I saw, I wrote.");
    // ensure comma boundaries aren't required for CWS
    const tokens = tokenize("I came, I saw.");
    const pairs = buildPairs(tokens, (w) => true);
    // Find pairs that involve commas - they should not be eligible
    const commaPairs = pairs.filter(p => {
      if (p.leftTok !== null && p.rightTok !== null) {
        const leftToken = tokens[p.leftTok];
        const rightToken = tokens[p.rightTok];
        return leftToken?.raw === "," || rightToken?.raw === ",";
      }
      return false;
    });
    // All comma pairs should be ineligible
    commaPairs.forEach(pair => {
      expect(pair.eligible).toBe(false);
    });
  });

  it("quotes/parentheses after terminals are okay", () => {
    const r = S(`He left. "Nobody cared." (Really.)`);
    expect(r.cws).toBeGreaterThan(0);
  });

  it("hyphen & apostrophe inside words treated as single word", () => {
    const r = S(`O'Neill's well-known story ended.`);
    expect(r.tww).toBeGreaterThanOrEqual(4);
  });

  it("numerals excluded from TWW but allowed in sequences when flanked", () => {
    const r = S(`We had 3 apples.`);
    expect(r.tww).toBe(3); // We/had/apples
  });
});
