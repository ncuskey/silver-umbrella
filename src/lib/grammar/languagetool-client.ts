import type { GrammarChecker, GrammarIssue } from "@/lib/spell/types";

interface LTMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: {
    id: string;
    description: string;
    issueType?: string;
    category: { id: string; name: string };
  };
}
interface LTResponse { matches: LTMatch[] }

function mapIssues(data: LTResponse): GrammarIssue[] {
  return (data.matches || []).map((m) => ({
    offset: m.offset,
    length: m.length,
    category: m.rule?.category?.name || m.rule?.issueType || "GRAMMAR",
    message: m.shortMessage || m.message,
    replacements: (m.replacements || []).map(r => r.value),
    ruleId: m.rule?.id,
    categoryId: m.rule?.category?.id
  }));
}

async function doCheck(baseUrl: string, text: string, lang: string, signal?: AbortSignal) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v2/check`;
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", lang);
  body.set("enabledOnly", "false");
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal
  });
}

export function createLanguageToolChecker(
  proxyBase = "/api/languagetool",
  publicBase = "https://api.languagetool.org"
): GrammarChecker & { isPublic: () => boolean | null } {
  let active: "proxy" | "public" | null = null;

  async function tryCheck(base: string, text: string, lang: string, signal?: AbortSignal) {
    const endpoint = `${base.replace(/\/$/, "")}/v2/check`;
    const body = new URLSearchParams();
    body.set("text", text);
    body.set("language", lang);
    body.set("enabledOnly", "false");
    return fetch(endpoint, { method: "POST", headers: { "Content-Type":"application/x-www-form-urlencoded" }, body, signal });
  }

  return {
    async check(text: string, lang = "en-US", signal?: AbortSignal) {
      try {
        if (active !== "public") {
          const r1 = await tryCheck(proxyBase, text, lang, signal);
          if (r1.ok) { active = "proxy"; return mapIssues(await r1.json()); }
          if ([404,405,500].includes(r1.status)) active = "public";
        }
      } catch { active = "public"; }

      // fallback or sticky public
      const r2 = await tryCheck(publicBase, text, lang, signal);
      if (r2.ok) { active = "public"; return mapIssues(await r2.json()); }
      throw new Error(`LanguageTool failed: ${r2.status}`);
    },
    isPublic: () => active === "public"
  };
}