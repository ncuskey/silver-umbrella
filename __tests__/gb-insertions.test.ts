import { describe, it, expect } from "vitest";
import { groupInsertionsByBoundary } from "@/lib/gbAnnotate";
import type { VirtualTerminalInsertion } from "@/lib/types";

describe("GB Insertion Grouping", () => {
  it("groups insertions by boundary index", () => {
    const mockInsertions: VirtualTerminalInsertion[] = [
      {
        at: 10,
        char: ".",
        beforeBIndex: 4,
        reason: "GB",
        message: "Add period"
      },
      {
        at: 25,
        char: "!",
        beforeBIndex: 8,
        reason: "GB", 
        message: "Add exclamation"
      },
      {
        at: 30,
        char: ".",
        beforeBIndex: 8, // Same boundary as above
        reason: "GB",
        message: "Add period"
      }
    ];

    const result = groupInsertionsByBoundary(mockInsertions);
    
    expect(result.size).toBe(2);
    expect(result.get(4)).toHaveLength(1);
    expect(result.get(8)).toHaveLength(2);
    expect(result.get(4)?.[0].char).toBe(".");
    expect(result.get(8)?.[0].char).toBe("!");
    expect(result.get(8)?.[1].char).toBe(".");
  });

  it("handles empty insertions array", () => {
    const result = groupInsertionsByBoundary([]);
    expect(result.size).toBe(0);
  });

  it("handles undefined insertions", () => {
    const result = groupInsertionsByBoundary(undefined as any);
    expect(result.size).toBe(0);
  });
});
