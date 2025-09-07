export async function checkWithLT(text: string, lang = "en-US") {
  const body = new URLSearchParams({ text, language: lang });

  if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
    console.info("[LT] request", { language: lang, textLen: text.length, sample: text.slice(0, 80) });
  }

  const res = await fetch("/api/languagetool/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json(); // usually { matches: [...] }

  // Cache the last response for devtools and dump raw JSON
  if (typeof window !== "undefined") {
    (window as any).__LT_LAST__ = json;
    if ((window as any).__CBM_DEBUG__) {
      try {
        console.info("[LT] raw", JSON.parse(JSON.stringify(json))); // structured, no circular refs
      } catch {
        console.info("[LT] raw (stringified)", String(json));
      }
    }
  }

  return json;
}
