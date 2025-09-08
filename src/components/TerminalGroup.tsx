import React from 'react';

export type State = 'ok' | 'maybe' | 'bad';

export function TerminalGroup({
  id,
  state,
  onToggle,
  leftIdx, 
  dotIdx, 
  rightIdx,
  children,
}: {
  id: string; 
  state: State;
  onToggle: (id: string) => void;
  leftIdx: number; 
  dotIdx: number; 
  rightIdx: number;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`tg tg--${state}`}
      data-group-id={id}
      onClick={() => onToggle(id)}
      title="Terminal punctuation suggestion"
    >
      {/* make the inner tokens visually styled but not clickable */}
      <span className="tg__inner" aria-hidden>{children}</span>
    </span>
  );
}
