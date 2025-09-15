import React from 'react';

export type TokState = 'ok' | 'maybe' | 'bad';

export interface TokenModel {
  id: string;
  kind: 'word' | 'caret' | 'dot' | 'newline' | 'punct';
  text: string;
  state: TokState;
  selected?: boolean;
  // When true, this token is hidden/removed from UI + KPIs
  removed?: boolean;
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

export function Token({
  token,
  onToggle,
}: {
  token: TokenModel;
  onToggle: (id: string) => void;
}) {
  const cls = bubbleCls(token.state, token.selected ?? false);
  const isClickable = token.kind === 'word';
  
  return (
    <button
      type="button"
      className={cls}
      data-id={token.id}
      data-state={token.state}
      onClick={isClickable ? () => onToggle(token.id) : undefined}
      disabled={!isClickable}
    >
      {token.text}
    </button>
  );
}
