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

export function createLanguageToolChecker(baseUrl = "https://api.languagetool.org"): GrammarChecker {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v2/check`;
  return {
    async check(text: string, lang = "en-US"): Promise<GrammarIssue[]> {
      const body = new URLSearchParams();
      body.set("text", text);
      body.set("language", lang);
      body.set("enabledOnly", "false");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      if (!res.ok) throw new Error(`LanguageTool error: ${res.status}`);
      const data: LTResponse = await res.json();

      return (data.matches || []).map((m) => ({
        offset: m.offset,
        length: m.length,
        category: m.rule?.category?.name || m.rule?.issueType || "GRAMMAR",
        message: m.shortMessage || m.message,
        replacements: (m.replacements || []).map(r => r.value),
      }));
    }
  };
}