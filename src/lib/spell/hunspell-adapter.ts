import { loadModule } from "hunspell-asm";
import type { SpellChecker } from "./types";

/**
 * Real Hunspell loader using hunspell-asm (WASM).
 * Docs show the flow:
 *   const factory = await loadModule();
 *   const affPath = factory.mountBuffer(affBuf, "en_US.aff");
 *   const dicPath = factory.mountBuffer(dicBuf, "en_US.dic");
 *   const engine  = factory.create(affPath, dicPath);
 *   engine.spell("word"), engine.suggest("wrod")
 */

async function fetchBin(path: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function createHunspellSpellChecker(
  affPath = "/dicts/en_US.aff",
  dicPath = "/dicts/en_US.dic"
): Promise<SpellChecker> {
  // 1) Load wasm & get factory
  const factory = await loadModule();

  // 2) Fetch aff/dic and mount into the wasm FS (virtual paths)
  const [affBuf, dicBuf] = await Promise.all([fetchBin(affPath), fetchBin(dicPath)]);
  const affMounted = factory.mountBuffer(affBuf, "en_US.aff");
  const dicMounted = factory.mountBuffer(dicBuf, "en_US.dic");

  // 3) Create the engine
  const engine = factory.create(affMounted, dicMounted);

  // Optional: expose cleanup via closure (not used yet)
  // const dispose = () => { engine.dispose(); factory.unmount(affMounted); factory.unmount(dicMounted); };

  const normalize = (w: string) => w.replace(/[']/g, "'");

  return {
    isCorrect(word: string) {
      const b = normalize(word);
      // engine.spell() is case-sensitive depending on dictionary flags; try lower as well.
      return engine.spell(b) || engine.spell(b.toLowerCase());
    },
    suggestions(word: string, max = 5) {
      try {
        const out = engine.suggest(normalize(word)) || [];
        return out.slice(0, max);
      } catch {
        return [];
      }
    },
  };
}