export type WorkerMsg =
  | { type: "init"; affPath: string; dicPath: string }
  | { type: "check"; word: string; id: number };

export type WorkerReply =
  | { type: "ready" }
  | { type: "result"; id: number; ok: boolean }
  | { type: "error"; message: string };

self.onmessage = async (e: MessageEvent<WorkerMsg>) => {
  try {
    if (e.data.type === "init") {
      // TODO: fetch aff/dic, init WASM Hunspell in worker scope
      (self as any).hunspellReady = true;
      self.postMessage({ type: "ready" } as WorkerReply);
    } else if (e.data.type === "check") {
      const ok = (self as any).hunspellReady ? true /* TODO: real spell(word) */ : false;
      self.postMessage({ type: "result", id: e.data.id, ok } as WorkerReply);
    }
  } catch (err: any) {
    self.postMessage({ type: "error", message: String(err?.message || err) } as WorkerReply);
  }
};
