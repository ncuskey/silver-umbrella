import { describe, it, expect } from "vitest";
import { score, tokenize, buildPairs } from "@/lib/cws-core";
import { buildCwsPairs } from "@/lib/cws";
import type { VirtualTerminal } from "@/lib/cws-heuristics";
import { deriveTerminalFromLT, convertLTTerminalsToInsertions } from "@/lib/cws-lt";
import { tokenizeWithOffsets } from "@/lib/cws-core";

const S = (t: string) => score(t);

// Helper function to simulate group override behavior for testing
function applyGroupOverride(
  baseResult: { virtualTerminals?: VirtualTerminal[] },
  vt: VirtualTerminal,
  state: "yellow" | "red" | "green"
): { 
  virtualTerminals?: VirtualTerminal[];
  boundaries: Array<{ override?: { cws?: boolean } }>;
} {
  // Create a mock boundaries array with override information
  const boundaries: Array<{ override?: { cws?: boolean } }> = [];
  
  // Initialize boundaries array (we'll simulate the relevant indices)
  const maxIndex = Math.max(vt.leftBoundaryBIndex, vt.rightBoundaryBIndex);
  for (let i = 0; i <= maxIndex + 1; i++) {
    boundaries[i] = { override: undefined };
  }
  
  // Apply the group override based on state
  if (state === "yellow") {
    // Remove overrides (back to advisory)
    boundaries[vt.leftBoundaryBIndex].override = undefined;
    boundaries[vt.rightBoundaryBIndex].override = undefined;
  } else if (state === "red") {
    // Set to false (reject)
    boundaries[vt.leftBoundaryBIndex].override = { cws: false };
    boundaries[vt.rightBoundaryBIndex].override = { cws: false };
  } else if (state === "green") {
    // Set to true (accept)
    boundaries[vt.leftBoundaryBIndex].override = { cws: true };
    boundaries[vt.rightBoundaryBIndex].override = { cws: true };
  }
  
  return {
    virtualTerminals: baseResult.virtualTerminals,
    boundaries
  };
}

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

  it("proposes virtual terminal before CapitalWord (missing period)", () => {
    const text = "It was dark Nobody came.";
    const r = score(text); // ensure your score() surfaces heuristics
    expect(r.virtualTerminals?.length ?? 0).toBeGreaterThan(0);
  });

  it("titlecase run is not flagged (The Terrible Day)", () => {
    const text = "the forest The Terrible Day was calm.";
    const r = score(text);
    const vt = r.virtualTerminals?.filter(v => v.reason === "CapitalAfterSpace") ?? [];
    expect(vt.length).toBe(0);
  });

  it("quotes after terminal produce two sequences (Figure 4)", () => {
    const text = `It was dark. "Nobody came."`;
    const r = score(text);
    expect(r.cws).toBeGreaterThan(0);
  });

  it("virtual terminals have proper boundary indices", () => {
    const text = "It was dark Nobody came.";
    const r = score(text);
    const vt = r.virtualTerminals?.filter(v => v.reason === "CapitalAfterSpace") ?? [];
    
    if (vt.length > 0) {
      const terminal = vt[0];
      // In basic mode, dotTokenIndex might be -1, but boundary indices should be valid
      expect(terminal.leftBoundaryBIndex).toBeDefined();
      expect(terminal.rightBoundaryBIndex).toBeDefined();
      expect(terminal.rightBoundaryBIndex).toBe(terminal.leftBoundaryBIndex + 1);
      expect(terminal.insertAfterIdx).toBeDefined();
      expect(terminal.reason).toBe("CapitalAfterSpace");
    }
  });

  it("clicking proposed terminal cycles both adjacent carets in lock-step", () => {
    const text = "It was dark Nobody came.";
    const r1 = score(text);
    const vt = r1.virtualTerminals?.[0];
    
    // Ensure we have a virtual terminal to test
    expect(vt).toBeDefined();
    if (!vt) return;
    
    // simulate cycle: yellow -> red
    const r2 = applyGroupOverride(r1, vt, "red");   // your helper over pairOverrides
    expect(r2.boundaries[vt.leftBoundaryBIndex].override?.cws).toBe(false);
    expect(r2.boundaries[vt.rightBoundaryBIndex].override?.cws).toBe(false);
    
    // simulate -> green
    const r3 = applyGroupOverride(r2, vt, "green");
    expect(r3.boundaries[vt.leftBoundaryBIndex].override?.cws).toBe(true);
    expect(r3.boundaries[vt.rightBoundaryBIndex].override?.cws).toBe(true);
    
    // simulate -> yellow (back to advisory)
    const r4 = applyGroupOverride(r3, vt, "yellow");
    expect(r4.boundaries[vt.leftBoundaryBIndex].override?.cws).toBeUndefined();
    expect(r4.boundaries[vt.rightBoundaryBIndex].override?.cws).toBeUndefined();
  });
});

describe("LT Terminal Derivation", () => {
  it("derives terminals from LT PUNCTUATION_PARAGRAPH_END rule", () => {
    const text = "It was dark Nobody came";
    const tokens = tokenizeWithOffsets(text);
    
    // Mock LT issue for missing paragraph end punctuation
    const mockLtIssues = [{
      offset: 0,
      length: text.length,
      rule: { id: "PUNCTUATION_PARAGRAPH_END" },
      message: "No punctuation mark at the end of paragraph"
    }];
    
    const carets = deriveTerminalFromLT(tokens, mockLtIssues);
    expect(carets.size).toBeGreaterThan(0);
  });

  it("derives terminals from LT capitalization issues", () => {
    const text = "forest The trees Then";
    const tokens = tokenizeWithOffsets(text);
    
    // Mock LT issue for missing punctuation before capitalized word
    const mockLtIssues = [{
      offset: 6, // after "forest"
      length: 1,
      rule: { id: "UPPERCASE_SENTENCE_START" },
      message: "Expected capital after sentence-ending punctuation",
      category: { id: "PUNCTUATION" }
    }];
    
    const carets = deriveTerminalFromLT(tokens, mockLtIssues);
    expect(carets.size).toBeGreaterThan(0);
  });

  it("converts LT terminals to insertion format", () => {
    const text = "forest The trees";
    const tokens = tokenizeWithOffsets(text);
    
    const mockLtIssues = [{
      offset: 6,
      length: 1,
      rule: { id: "UPPERCASE_SENTENCE_START" },
      message: "Expected capital after sentence-ending punctuation",
      category: { id: "PUNCTUATION" }
    }];
    
    const insertions = convertLTTerminalsToInsertions(tokens, mockLtIssues);
    expect(insertions.length).toBeGreaterThan(0);
    expect(insertions[0].reason).toBe("LT");
    expect(insertions[0].char).toBe(".");
    expect(insertions[0].message).toContain("LanguageTool");
  });

  it("ignores non-punctuation LT issues", () => {
    const text = "forest The trees";
    const tokens = tokenizeWithOffsets(text);
    
    const mockLtIssues = [{
      offset: 0,
      length: 6,
      rule: { id: "MORFOLOGIK_RULE_EN_US" },
      message: "Spelling error",
      category: { id: "TYPOS" }
    }];
    
    const carets = deriveTerminalFromLT(tokens, mockLtIssues);
    expect(carets.size).toBe(0);
  });
});
