import clsx from "clsx";

export type Status = "ok" | "maybe" | "bad";

export function cycle(s: Status): Status {
  return s === "ok" ? "maybe" : s === "maybe" ? "bad" : "ok";
}

export interface TerminalGroupModel {
  id: string;              // "tg-<anchorIndex>"
  anchorIndex: number;     // boundary index *after* the word
  status: Status;          // 'ok' | 'maybe' | 'bad'
  selected: boolean;
  source: 'GB' | 'PARA';
  // When true, hide this group from UI + KPIs
  removed?: boolean;
}

export default function TerminalGroup({
  id,
  status,
  selected,
  onToggle,
}: {
  id: string;
  status: Status;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-kind="tg"
      data-id={id}
      className={pillCls(status, selected)}
      onClick={() => {
        console.log("[CLICK] TG", id);
        onToggle(id);
      }}
    >
      {/* Keep inner glyphs non-interactive so the *group* is the click target */}
      <span className="pointer-events-none select-none">^</span>
      <span className="mx-1 pointer-events-none select-none">.</span>
      <span className="pointer-events-none select-none">^</span>
    </button>
  );
}

export function pillCls(status: Status, selected: boolean) {
  return clsx(
    "inline-flex items-center rounded-full border-2 px-2 py-0.5 text-[13px] leading-none transition-colors",
    "align-middle",
    selected && "ring-2 ring-offset-1 ring-offset-white",
    status === "ok" && "bg-emerald-50 text-emerald-800 border-emerald-300 ring-emerald-300",
    status === "maybe" && "bg-amber-50 text-amber-800 border-amber-300 ring-amber-300",
    status === "bad" && "bg-rose-50 text-rose-800 border-rose-300 ring-rose-300"
  );
}
