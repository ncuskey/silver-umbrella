import type { SpellChecker } from "./types";

let current: SpellChecker | null = null;

export function setExternalSpellChecker(sc: SpellChecker | null) {
  current = sc;
}

export function getExternalSpellChecker(): SpellChecker | null {
  return current;
}
