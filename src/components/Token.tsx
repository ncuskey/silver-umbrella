import React from 'react';

export type TokState = 'ok' | 'maybe' | 'bad';

export interface TokenModel {
  id: string;
  kind: 'word' | 'caret' | 'dot' | 'newline';
  text: string;
  state: TokState;
}

export function Token({
  token,
  onToggle,
}: {
  token: TokenModel;
  onToggle: (id: string) => void;
}) {
  const cls = `token token--${token.kind} state-${token.state}`;
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
