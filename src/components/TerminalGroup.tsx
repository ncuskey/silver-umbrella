import React from 'react';

export type TGState = 'ok' | 'maybe' | 'bad';

export interface TerminalGroupModel {
  id: string;
  state: TGState;
  leftIdx: number;
  dotIdx: number;
  rightIdx: number;
  selected?: boolean;
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
  onClick,
}: {
  id: string;
  status: 'ok'|'maybe'|'bad';
  selected: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={bubbleCls(status, selected)}
      onClick={() => onClick(id)}
      title="Terminal punctuation suggestion"
    >
      <span className="select-none">^</span>
      <span className="mx-1 select-none">.</span>
      <span className="select-none">^</span>
    </button>
  );
}
