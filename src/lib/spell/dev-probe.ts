import { createHunspellSpellChecker } from "./hunspell-adapter";

export async function probeHunspell() {
  const sc = await createHunspellSpellChecker("/dicts/en_US.aff", "/dicts/en_US.dic");
  const words = ["believe","butter","worry","can't","we'll","O'Neill's","hyphen","names"];
  const out = words.map(w => `${w}:${sc.isCorrect(w)}`);
  console.log("[probeHunspell]", out.join(" | "));
}
