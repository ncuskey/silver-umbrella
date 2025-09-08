import React from 'react';

export type TGState = 'ok' | 'maybe' | 'bad';

export interface TerminalGroupModel {
  id: string;              // "tg-<anchorIndex>"
  anchorIndex: number;     // boundary index *after* the word
  status: TGState;         // 'ok' | 'maybe' | 'bad'
  selected: boolean;
  source: 'GB' | 'PARA';
}

// keep these as plain string literals so Tailwind can see them (and we safelist them anyway)
const STATUS_CLS: Record<'ok'|'maybe'|'bad', string> = {
  ok:    'bg-green-50 text-green-800 ring-green-300',
  maybe: 'bg-amber-50 text-amber-800 ring-amber-300',
  bad:   'bg-red-50 text-red-800 ring-red-300',
};

function bubbleCls(status: 'ok'|'maybe'|'bad', selected: boolean) {
  return [
    'inline-flex items-center rounded-xl px-2 py-0.5 leading-6',
    'ring-1 ring-offset-1 ring-offset-white',  // or ring-offset-background
    STATUS_CLS[status],
    selected ? 'ring-2' : ''
  ].join(' ');
}

export function TerminalGroup({
  id,
  status,
  selected,
  onToggle,
}: {
  id: string;
  status: 'ok'|'maybe'|'bad';
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={bubbleCls(status, selected)}
      onClick={() => onToggle(id)}
      title="Terminal punctuation suggestion"
    >
      {/* make inner glyphs non-clickable & inherit color from parent */}
      <span className="pointer-events-none select-none">^</span>
      <span className="mx-1 pointer-events-none select-none">.</span>
      <span className="pointer-events-none select-none">^</span>
    </button>
  );
}
