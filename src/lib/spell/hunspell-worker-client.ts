import type { SpellChecker } from "./types";
import type { WorkerMsg, WorkerReply } from "@/workers/hunspell.worker";

export async function createWorkerSpellChecker(affPath: string, dicPath: string): Promise<SpellChecker> {
  const worker = new Worker(new URL("@/workers/hunspell.worker.ts", import.meta.url), { type: "module" });
  await new Promise<void>((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerReply>) => {
      if (e.data.type === "ready") { worker.removeEventListener("message", onMsg); resolve(); }
      else if (e.data.type === "error") { reject(new Error(e.data.message)); }
    };
    worker.addEventListener("message", onMsg);
    worker.postMessage({ type: "init", affPath, dicPath } as WorkerMsg);
  });

  let seq = 0;
  const waiters = new Map<number, (ok: boolean) => void>();
  worker.addEventListener("message", (e: MessageEvent<WorkerReply>) => {
    if (e.data.type === "result") {
      const fn = waiters.get(e.data.id); if (fn) { waiters.delete(e.data.id); fn(e.data.ok); }
    }
  });

  return {
    isCorrect(word: string): boolean {
      const id = ++seq;
      worker.postMessage({ type: "check", word, id } as WorkerMsg);
      // Optimistic return; you can attach a cache to serve real results on subsequent checks.
      return true;
    },
    suggestions() { return []; }
  };
}
