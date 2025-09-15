import { describe, it, expect } from 'vitest';
import { tokenize } from '@/lib/tokenize';

describe('tokenize()', () => {
  it('keeps the first letter of the first word', () => {
    const toks = tokenize('apple');
    expect(toks.length).toBe(1);
    expect(toks[0].raw).toBe('apple');
    expect(toks[0].start).toBe(0);
    expect(toks[0].end).toBe(5);
  });

  it('handles contractions and possessives as one word', () => {
    const text = "don't we're Alex's children’s";
    const toks = tokenize(text).filter(t => t.type === 'WORD');
    expect(toks.map(t => t.raw)).toEqual(["don't", "we're", "Alex's", "children’s"]);
  });

  it('keeps hyphenated words as one token', () => {
    const toks = tokenize('sister-in-law').filter(t => t.type === 'WORD');
    expect(toks.map(t => t.raw)).toEqual(['sister-in-law']);
  });

  it('preserves explicit caret boundaries', () => {
    const toks = tokenize('^ apple ^');
    expect(toks.map(t => t.raw)).toEqual(['^', 'apple', '^']);
    expect(toks.map(t => t.type)).toEqual(['BOUNDARY', 'WORD', 'BOUNDARY']);
  });

  it('tokenizes simple multi-word string without dropping first letters', () => {
    const toks = tokenize('yesterday me');
    const words = toks.filter(t => t.type === 'WORD');
    expect(words.map(w => w.raw)).toEqual(['yesterday', 'me']);
    expect(words[0].start).toBe(0);
  });
});

