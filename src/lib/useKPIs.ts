import { useState, useEffect } from 'react';
import type { TokenModel } from '@/components/Token';
import type { TerminalGroupModel } from '@/components/TerminalGroup';
import type { Token } from './types';

export interface KPIs {
  tww: number;
  spelledCorrect: number;
  cws: number;
  eligible: number;
  percentCws: number;
  cwsPerMinute: number;
}

// Helper functions for KPI calculations
const isWordToken = (t: Token) => /^[A-Za-z][A-Za-z'’-]*$/.test(t.raw) && !/^\d/.test(t.raw);
const isNumberToken = (t: Token) => /^\d+([.,]\d+)*$/.test(t.raw);

// TWW (Total Words Written; numerals excluded)
function calcTWW(tokens: Token[]): number {
  return tokens.filter(t => isWordToken(t) && !isNumberToken(t)).length;
}

// WSC (Words Spelled Correctly)
function calcWSC(tokens: Token[], tokenModels: TokenModel[]): number {
  let wsc = 0;
  tokens.forEach((t, i) => {
    if (isWordToken(t) && !isNumberToken(t)) {
      const tokenModel = tokenModels.find(tm => tm.id === `token-${i}`);
      const currentState = tokenModel?.state ?? 'ok';
      if (currentState !== 'bad') wsc++;
    }
  });
  return wsc;
}

// CWS (Correct Writing Sequences) - simplified version
function calcCWS(tokens: Token[], tokenModels: TokenModel[], groupModels: TerminalGroupModel[]): { cws: number; eligible: number } {
  let eligible = 0;
  let cws = 0;

  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i+1];
    if (!isWordToken(a) || !isWordToken(b)) continue;
    
    // exclude commas
    if (a.raw === "," || b.raw === ",") continue;

    eligible++;

    // Check current state overrides
    const aModel = tokenModels.find(tm => tm.id === `token-${i}`);
    const bModel = tokenModels.find(tm => tm.id === `token-${i+1}`);
    const aState = aModel?.state ?? 'ok';
    const bState = bModel?.state ?? 'ok';
    const spellOk = aState !== 'bad' && bState !== 'bad';

    if (spellOk) cws++;
  }

  return { cws, eligible };
}

// CWS/min (uses the timer mm:ss input)
function cwsPerMin(cws: number, mmss: string): number {
  const [mm, ss] = mmss.split(":").map(n => parseInt(n, 10) || 0);
  const minutes = Math.max(0.5, mm + ss/60); // guard tiny values
  return cws / minutes;
}

export function useKPIs(
  tokens: Token[], 
  tokenModels: TokenModel[], 
  groupModels: TerminalGroupModel[], 
  timeMMSS: string
): KPIs {
  const [kpis, setKPIs] = useState<KPIs>({
    tww: 0,
    spelledCorrect: 0,
    cws: 0,
    eligible: 0,
    percentCws: 0,
    cwsPerMinute: 0
  });

  useEffect(() => {
    const tww = calcTWW(tokens);
    const spelledCorrect = calcWSC(tokens, tokenModels);
    const { cws, eligible } = calcCWS(tokens, tokenModels, groupModels);
    const percentCws = eligible > 0 ? Math.round((cws / eligible) * 100) : 0;
    const cwsPerMinute = cwsPerMin(cws, timeMMSS);

    setKPIs({
      tww,
      spelledCorrect,
      cws,
      eligible,
      percentCws,
      cwsPerMinute
    });
  }, [tokens, tokenModels, groupModels, timeMMSS]);

  return kpis;
}
