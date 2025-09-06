import type { SpellChecker } from "./types";

// Hunspell WASM binding types
type HunspellCtor = new (aff: Uint8Array, dic: Uint8Array) => {
  spell(word: string): boolean;
  suggest(word: string): string[];
  free(): void;
};

// Load Hunspell WASM library
async function loadHunspellWasm(): Promise<{ Hunspell: HunspellCtor }> {
  const { Hunspell } = await import("hunspell-wasm");
  return { Hunspell };
}

async function fetchBin(path: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function createHunspellSpellChecker(
  affPath = "/dicts/en_US.aff",
  dicPath = "/dicts/en_US.dic"
): Promise<SpellChecker> {
  const [{ Hunspell }, aff, dic] = await Promise.all([
    loadHunspellWasm(),
    fetchBin(affPath),
    fetchBin(dicPath),
  ]);
  const engine = new Hunspell(aff, dic);

  const norm = (w: string) => w.replace(/[']/g, "'");

  return {
    isCorrect(word: string) {
      const base = norm(word);
      // Some builds are case-sensitive
      return engine.spell(base) || engine.spell(base.toLowerCase());
    },
    suggestions(word: string, max = 5) {
      try { return (engine.suggest(norm(word)) || []).slice(0, max); }
      catch { return []; }
    },
  };
}
