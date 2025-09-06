import type { SpellChecker } from "./types";

// Simple dictionary-based spell checker
class DictionarySpellChecker {
  private words: Set<string> = new Set();
  
  async loadDictionary(dicPath: string): Promise<void> {
    try {
      const response = await fetch(dicPath);
      if (!response.ok) throw new Error(`Failed to fetch dictionary: ${response.status}`);
      
      const text = await response.text();
      const lines = text.split('\n');
      
      // Skip the first line (word count) and parse words
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith('/')) {
          // Extract the word (before any slash or space)
          const word = line.split(/[/\s]/)[0].toLowerCase();
          if (word) {
            this.words.add(word);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load dictionary:', error);
      throw error;
    }
  }
  
  check(word: string): boolean {
    const normalized = word.toLowerCase().replace(/[']/g, "'");
    return this.words.has(normalized);
  }
  
  suggest(word: string): string[] {
    // Simple suggestion based on edit distance
    const normalized = word.toLowerCase();
    const suggestions: string[] = [];
    
    for (const dictWord of this.words) {
      if (this.editDistance(normalized, dictWord) <= 2) {
        suggestions.push(dictWord);
      }
    }
    
    return suggestions.slice(0, 5);
  }
  
  private editDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[b.length][a.length];
  }
}

export async function createHunspellSpellChecker(
  affPath = "/dicts/en_US.aff",
  dicPath = "/dicts/en_US.dic"
): Promise<SpellChecker> {
  const engine = new DictionarySpellChecker();
  await engine.loadDictionary(dicPath);

  const norm = (w: string) => w.replace(/[']/g, "'");

  return {
    isCorrect(word: string) {
      const base = norm(word);
      return engine.check(base) || engine.check(base.toLowerCase());
    },
    suggestions(word: string, max = 5) {
      try { 
        return engine.suggest(norm(word)).slice(0, max); 
      } catch { 
        return []; 
      }
    },
  };
}
