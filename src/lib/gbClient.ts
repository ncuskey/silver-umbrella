export type GbEdit = {
  start: number; 
  end: number; 
  replace: string;
  edit_type: "ADD" | "DELETE" | "MODIFY" | string;
  err_cat?: string; 
  err_type?: string; 
  err_desc?: string;
};

export type GbResponse = { 
  correction?: string; 
  status: number; 
  edits: GbEdit[]; 
  latency?: number 
};

export async function checkWithGrammarBot(text: string): Promise<GbResponse> {
  const res = await fetch("/api/grammarbot/v1/check", {
    method: "POST", 
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json = await res.json();
  if ((window as any).__CBM_DEBUG__) {
    console.info("[GB] raw", json);
    console.table((json.edits ?? []).map(e => ({
      start: e.start, 
      end: e.end, 
      replace: e.replace,
      edit_type: e.edit_type, 
      err_cat: e.err_cat
    })));
  }
  return json;
}
