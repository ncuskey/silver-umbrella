// lib/buildTerminalGroups.ts
import type { Status } from "@/components/TerminalGroup";
import type { Token } from "./types";

export type TerminalGroup = {
  id: string;            // "tg-<anchorIndex>"
  anchorIndex: number;   // boundary after the word
  status: Status;
  selected: boolean;
  source: "GB" | "PARA";
};

export function buildTerminalGroups(
  tokens: Token[],
  gbInserts: Array<{ anchorIndex: number }>,
  paragraphs: Array<{ start: number; end: number }>
): TerminalGroup[] {
  const out: TerminalGroup[] = [];
  const seen = new Set<number>();

  const add = (anchorIndex: number, status: Status, source: "GB" | "PARA") => {
    if (seen.has(anchorIndex)) return; // ✅ prevents "^ . ^ . ^"
    seen.add(anchorIndex);
    out.push({
      id: `tg-${anchorIndex}`,
      anchorIndex,
      status,
      selected: false,
      source,
    });
  };

  // A) GB '.' inserts → maybe
  for (const e of gbInserts) add(e.anchorIndex, "maybe", "GB");

  // B) Paragraph-end terminals (except last paragraph & empty paras) → maybe
  paragraphs.forEach((p, i) => {
    const isLast = i === paragraphs.length - 1;

    // find last *word* in the paragraph
    let lastWordIdx = -1;
    for (let k = p.end; k >= p.start; k--) {
      if (tokens[k]?.type === "WORD") {
        lastWordIdx = k;
        break;
      }
    }
    const isEmpty = lastWordIdx === -1;
    if (isLast || isEmpty) return; // ✅ skip by spec

    add(lastWordIdx + 1, "maybe", "PARA");
  });

  console.log("[VT] terminal groups", out.map(g => `${g.id}:${g.status}`));
  return out;
}
