import type { GrammarChecker, GrammarIssue } from "@/lib/spell/types";

// Configuration functions for LanguageTool settings
const defaultBase = process.env.NEXT_PUBLIC_LT_BASE_URL || "https://api.languagetool.org";

// Request profile presets for parity with LT website
export const REQUEST_PROFILES = {
  siteDefault: { language: "en-US", level: "default" },
  sitePicky: { language: "en-US", level: "picky" },
  autoDetect: { language: "auto", preferredVariants: "en-US", level: "default" }
} as const;

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

// Exact deduplication function (no category filtering)
function dedupeLt(issues: LTMatch[]): LTMatch[] {
  const seen = new Set<string>();
  const out: LTMatch[] = [];
  for (const m of issues) {
    const k = `${m.rule?.id}:${m.offset}:${m.length}:${m.message}`;
    if (!seen.has(k)) { 
      seen.add(k); 
      out.push(m); 
    }
  }
  return out;
}

// Robust spelling classification function
function isSpelling(match: LTMatch): boolean {
  const categoryId = (match.rule?.category?.id ?? "").toUpperCase();
  const ruleId = (match.rule?.id ?? "").toUpperCase();
  
  return categoryId === "TYPOS" || ruleId.startsWith("MORFOLOGIK_RULE");
}

// Overlap helper function (shared everywhere)
export const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => 
  a0 < b1 && a1 > b0;

// Helper function to identify spelling/typo issues (legacy compatibility)
function isTypo(match: LTMatch): boolean {
  return isSpelling(match);
}

function mapIssues(data: LTResponse): GrammarIssue[] {
  // Apply exact deduplication first
  const deduped = dedupeLt(data.matches || []);
  
  return deduped.map((m) => {
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

async function doCheck(baseUrl: string, text: string, lang: string, signal?: AbortSignal, retryCount = 0, level = "default") {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v2/check`;
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", lang);
  body.set("level", level); // Use provided level (default or picky)
  body.set("enabledOnly", "false");
  
  // Use language=en-US or auto with preferredVariants=en-US to ensure spelling runs
  if (lang === "auto") {
    body.set("preferredVariants", "en-US");
  } else if (lang === "en") {
    // Convert generic "en" to "en-US" to ensure spelling is enabled
    body.set("language", "en-US");
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
    return doCheck(baseUrl, text, lang, signal, retryCount + 1, level);
  }

  return response;
}

export function createLanguageToolChecker(
  proxyBase = "/api/languagetool"
): GrammarChecker & { isPublic: () => boolean | null; isDisabled: () => boolean } {
  let active: "proxy" | "public" | null = null;

  async function tryCheck(base: string, text: string, lang: string, signal?: AbortSignal, level = "default") {
    return doCheck(base, text, lang, signal, 0, level);
  }

  return {
    async check(text: string, lang = "en-US", signal?: AbortSignal, level = "default") {
      // Check privacy setting - if "local", don't send text to cloud
      if (getLtPrivacy() === "local") {
        return []; // Return empty array when privacy mode is enabled
      }

      const publicBase = getLtBase();
      
      try {
        if (active !== "public") {
          const r1 = await tryCheck(proxyBase, text, lang, signal, level);
          if (r1.ok) { active = "proxy"; return mapIssues(await r1.json()); }
          if ([404,405,500].includes(r1.status)) active = "public";
        }
      } catch { active = "public"; }

      // fallback or sticky public
      const r2 = await tryCheck(publicBase, text, lang, signal, level);
      if (r2.ok) { active = "public"; return mapIssues(await r2.json()); }
      throw new Error(`LanguageTool failed: ${r2.status}`);
    },
    isPublic: () => active === "public",
    isDisabled: () => getLtPrivacy() === "local"
  };
}

// Dev helper for parity testing - compare your panel vs LT's site
export function summarizeLT(issues: LTMatch[]) {
  const cat = new Map<string, number>();
  const rule = new Map<string, number>();
  for (const m of issues) {
    cat.set(m.rule?.category?.id ?? "?", (cat.get(m.rule?.category?.id ?? "?") || 0) + 1);
    rule.set(m.rule?.id ?? "?", (rule.get(m.rule?.id ?? "?") || 0) + 1);
  }
  console.groupCollapsed("[LT] summary");
  console.table([...cat.entries()].map(([category,count]) => ({ category, count })));
  console.table([...rule.entries()].map(([ruleId,count]) => ({ ruleId, count })));
  console.groupEnd();
}