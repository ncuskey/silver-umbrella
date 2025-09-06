import { loadModule } from "hunspell-asm";
import type { SpellChecker } from "./types";

/** Hunspell via WASM (hunspell-asm) */
async function fetchBin(path: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function createHunspellSpellChecker(
  affPath = "/dicts/en_US.aff",
  dicPath = "/dicts/en_US.dic"
): Promise<SpellChecker> {
  const factory = await loadModule();
  const [affBuf, dicBuf] = await Promise.all([fetchBin(affPath), fetchBin(dicPath)]);
  const affMounted = factory.mountBuffer(affBuf, "en_US.aff");
  const dicMounted = factory.mountBuffer(dicBuf, "en_US.dic");
  const engine = factory.create(affMounted, dicMounted);

  const normalize = (w: string) => w.replace(/[']/g, "'");

  return {
    isCorrect(word: string) {
      const b = normalize(word);
      return engine.spell(b) || engine.spell(b.toLowerCase());
    },
    suggestions(word: string, max = 5) {
      try { return (engine.suggest(normalize(word)) || []).slice(0, max); }
      catch { return []; }
    },
  };
}