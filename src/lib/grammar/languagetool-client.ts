import type { GrammarChecker, GrammarIssue } from "@/lib/spell/types";

// Configuration functions for LanguageTool settings
const defaultBase = process.env.NEXT_PUBLIC_LT_BASE_URL || "https://api.languagetool.org";

export function getLtBase() {
  const local = typeof window !== "undefined" ? localStorage.getItem("lt.base") : null;
  return local || defaultBase;
}

export function getLtPrivacy() {
  if (typeof window !== "undefined" && localStorage.getItem("lt.privacy") == null) {
    localStorage.setItem("lt.privacy", "local"); // default to local-only for FERPA/COPPA compliance
  }
  const v = typeof window !== "undefined" ? localStorage.getItem("lt.privacy") : null;
  // "local" = do not send text (disable LT), "cloud" = allow
  return v === "local" ? "local" : "cloud";
}

export function clearSessionData() {
  if (typeof window !== "undefined") {
    // Clear LanguageTool settings
    localStorage.removeItem("lt.privacy");
    localStorage.removeItem("lt.base");
    // Reset to default local-only mode
    localStorage.setItem("lt.privacy", "local");
  }
}

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

// Helper function to identify spelling/typo issues
function isTypo(match: LTMatch): boolean {
  const categoryId = (match.rule?.category?.id ?? "").toUpperCase();
  const ruleId = (match.rule?.id ?? "").toUpperCase();
  
  return categoryId === "TYPOS" || ruleId.startsWith("MORFOLOGIK_RULE");
}

function mapIssues(data: LTResponse): GrammarIssue[] {
  return (data.matches || []).map((m) => {
    const isTypoIssue = isTypo(m);
    return {
      offset: m.offset,
      length: m.length,
      category: isTypoIssue ? "TYPOS" : (m.rule?.category?.name || m.rule?.issueType || "GRAMMAR"),
      message: m.shortMessage || m.message,
      replacements: (m.replacements || []).map(r => r.value),
      ruleId: m.rule?.id,
      categoryId: m.rule?.category?.id
    };
  });
}

// Exponential backoff for rate limiting
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function doCheck(baseUrl: string, text: string, lang: string, signal?: AbortSignal, retryCount = 0) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v2/check`;
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", lang);
  body.set("level", "default"); // Match LT website defaults
  body.set("enabledOnly", "false");
  
  // Ensure spelling is enabled by setting preferredVariants for auto-detection
  if (lang === "auto") {
    body.set("preferredVariants", "en-US");
  }
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal
  });

  // Handle rate limiting with exponential backoff
  if (response.status === 429 && retryCount < 3) {
    const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
    await sleep(delay);
    return doCheck(baseUrl, text, lang, signal, retryCount + 1);
  }

  return response;
}

export function createLanguageToolChecker(
  proxyBase = "/api/languagetool"
): GrammarChecker & { isPublic: () => boolean | null; isDisabled: () => boolean } {
  let active: "proxy" | "public" | null = null;

  async function tryCheck(base: string, text: string, lang: string, signal?: AbortSignal) {
    return doCheck(base, text, lang, signal);
  }

  return {
    async check(text: string, lang = "en-US", signal?: AbortSignal) {
      // Check privacy setting - if "local", don't send text to cloud
      if (getLtPrivacy() === "local") {
        return []; // Return empty array when privacy mode is enabled
      }

      const publicBase = getLtBase();
      
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
    isPublic: () => active === "public",
    isDisabled: () => getLtPrivacy() === "local"
  };
}