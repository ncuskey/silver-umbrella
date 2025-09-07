export async function checkWithLT(text: string, lang = "en-US") {
  const body = new URLSearchParams({
    text,
    language: lang,
    // keep defaults; we only filter later
  });
  const res = await fetch("/api/languagetool/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) throw new Error("LT request failed");
  return res.json(); // { matches: [...] } usually
}
