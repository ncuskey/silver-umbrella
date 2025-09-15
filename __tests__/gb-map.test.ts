import { describe, it, expect } from 'vitest';
import { tokenize } from '@/lib/tokenize';
import { bootstrapStatesFromGB } from '@/lib/gb-map';

describe('gb-map token kind alignment', () => {
  it('marks only WORD tokens as kind:"word"', () => {
    const text = "Hello, world!";
    const tokens = tokenize(text);
    const { tokenModels } = bootstrapStatesFromGB(text, tokens, []);
    // Map token raw -> kind
    const kinds = tokenModels.map(tm => tm.kind);
    // Expect: Hello (word), , (punct), world (word), ! (dot)
    expect(kinds).toEqual(['word', 'punct', 'word', 'dot']);
  });

  it('keeps caret tokens as kind:"caret"', () => {
    const text = '^ apple ^';
    const tokens = tokenize(text);
    const { tokenModels } = bootstrapStatesFromGB(text, tokens, []);
    expect(tokenModels.map(t => t.kind)).toEqual(['caret', 'word', 'caret']);
  });
});

