export type GbEdit = {
  start: number; 
  end: number; 
  replace: string;
  edit_type: "ADD" | "DELETE" | "MODIFY" | string;
  err_cat?: string; 
  err_type?: string; 
  err_desc?: string;
};

export type LlamaDecision = { index: number; keep: boolean; reason?: string };

export type GbResponse = { 
  correction?: string; 
  status: number; 
  edits: GbEdit[]; 
  latency?: number;
  llamaVerdict?: { status: "ok" | "skipped" | "error"; decisions?: LlamaDecision[]; error?: string };
};

async function runFixer(text: string): Promise<GbResponse> {
  const res = await fetch("/api/grammarbot/v1/check", {
    method: "POST", 
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  
  if (res.status === 429) {
    // Show unobtrusive banner and retry after 1-2s
    console.warn("[GB] Rate limited, retrying in 1.5s...");
    await new Promise(resolve => setTimeout(resolve, 1500));
    return checkWithGrammarBot(text);
  }
  
  const json = await res.json().catch(() => ({}));
  if (typeof window !== "undefined" && (window as any).__CBM_DEBUG__) {
    console.info("[GB] raw", json);
    console.table((json.edits ?? []).map((e: GbEdit) => ({
      start: e.start, 
      end: e.end, 
      replace: e.replace,
      edit_type: e.edit_type, 
      err_cat: e.err_cat
    })));
  }
  // Always surface HTTP status back to the caller so UI can react
  return { status: res.status, ...(json as any) } as GbResponse;
}

export async function checkWithLanguageTool(text: string): Promise<GbResponse> {
  return runFixer(text);
}

export const checkWithGrammarBot = checkWithLanguageTool;
