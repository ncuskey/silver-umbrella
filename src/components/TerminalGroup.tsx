import React from 'react';

export type TGState = 'ok' | 'maybe' | 'bad';

export interface TerminalGroupModel {
  id: string;
  state: TGState;
  leftIdx: number;
  dotIdx: number;
  rightIdx: number;
}

export function TerminalGroup({
  group,
  onToggle,
  children,
}: {
  group: TerminalGroupModel;
  onToggle: (id: string) => void;
  children: React.ReactNode; // renders ^ . ^
}) {
  return (
    <span
      className={`tg state-${group.state}`}
      data-group-id={group.id}
      data-state={group.state}
      onClick={() => onToggle(group.id)}
      title="Terminal punctuation suggestion"
    >
      <span className="tg__inner" aria-hidden>{children}</span>
    </span>
  );
}
