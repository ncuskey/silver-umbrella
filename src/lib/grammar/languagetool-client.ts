import type { GrammarChecker, GrammarIssue } from "@/lib/spell/types";

interface LTMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { id: string; description: string; issueType?: string; category: { id: string; name: string } };
}
interface LTResponse { matches: LTMatch[] }

function mapIssues(data: LTResponse): GrammarIssue[] {
  return (data.matches || []).map((m) => ({
    offset: m.offset,
    length: m.length,
    category: m.rule?.category?.name || m.rule?.issueType || "GRAMMAR",
    message: m.shortMessage || m.message,
    replacements: (m.replacements || []).map(r => r.value),
  }));
}

async function doCheck(baseUrl: string, text: string, lang: string, signal?: AbortSignal) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v2/check`;
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", lang);
  body.set("enabledOnly", "false");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal
  });

  return res;
}

/** 
 * Default tries your proxy at /api/languagetool; if that fails (404, 405, 500, network),
 * it falls back to the public LanguageTool service.
 */
export function createLanguageToolChecker(
  proxyBase = "/api/languagetool",
  publicBase = "https://api.languagetool.org"
): GrammarChecker {
  return {
    async check(text: string, lang = "en-US", signal?: AbortSignal): Promise<GrammarIssue[]> {
      try {
        const r1 = await doCheck(proxyBase, text, lang, signal);
        if (r1.ok) return mapIssues(await r1.json());
        // Fallback on typical function-missing statuses
        if ([404, 405, 500].includes(r1.status)) {
          const r2 = await doCheck(publicBase, text, lang, signal);
          if (r2.ok) return mapIssues(await r2.json());
          throw new Error(`LanguageTool fallback failed: ${r2.status}`);
        }
        throw new Error(`LanguageTool error: ${r1.status}`);
      } catch (e) {
        // Network errors etc. -> final attempt to public
        try {
          const r2 = await doCheck(publicBase, text, lang, signal);
          if (r2.ok) return mapIssues(await r2.json());
          throw new Error(`LanguageTool fallback failed: ${r2.status}`);
        } catch (e2) {
          throw e2;
        }
      }
    }
  };
}