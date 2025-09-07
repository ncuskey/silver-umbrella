export async function checkWithLT(text: string, lang = "en-US") {
  const body = new URLSearchParams({
    text,
    language: lang,
    level: "default",                       // or "picky" to match LT web's "Picky mode"
    enabledOnly: "false",
  });

  if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
    console.info("[LT] request", Object.fromEntries(body.entries()));
  }

  const res = await fetch("/api/languagetool/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();

  if (typeof window !== "undefined") {
    (window as any).__LT_LAST__ = json;
    if ((window as any).__CBM_DEBUG__) {
      console.info("[LT] raw", json);
      const matches = json.matches ?? json.issues ?? [];
      console.info("[LT] matches count", matches.length);
    }
  }
  return json;
}
