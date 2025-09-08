import { useState, useCallback } from 'react';
import type { TokenModel } from '@/components/Token';
import type { TerminalGroupModel } from '@/components/TerminalGroup';

export type TokState = 'ok' | 'maybe' | 'bad';

const cycle: Record<TokState, TokState> = { 
  ok: 'maybe', 
  maybe: 'bad', 
  bad: 'ok' 
};

export function useTokensAndGroups() {
  const [tokens, setTokens] = useState<TokenModel[]>([]);
  const [groups, setGroups] = useState<TerminalGroupModel[]>([]);

  const toggleWord = useCallback((id: string) => {
    setTokens(prev => prev.map(t => 
      t.id === id ? { ...t, state: cycle[t.state] } : t
    ));
  }, []);

  const toggleTerminal = useCallback((id: string) => {
    setGroups(prev => prev.map(g => 
      g.id === id ? { ...g, status: cycle[g.status] } : g
    ));
  }, []);

  // Debug logging
  console.log('[UI] tokens', tokens.map(t => `${t.text}:${t.state}`));
  console.log('[UI] groups', groups.map(g => `${g.id}:${g.status}`));

  return { 
    tokens, 
    setTokens, 
    groups, 
    setGroups, 
    toggleWord, 
    toggleTerminal 
  };
}
