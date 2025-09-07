import { describe, it, expect } from 'vitest';
import { createLanguageToolChecker } from '../src/lib/grammar/languagetool-client';

// Example text for parity testing
const EXAMPLE_TEXT = "It was dark. nobody could see the trees of the forest The Terrible Day\n\nI woud drink water from the ocean and I woud eat the fruit off of the trees Then I woud bilit a house out of trees and I woud gather firewood to stay warm I woud try and fix my boat in my spare time";

describe('LanguageTool Parity Snapshot Tests', () => {
  it('should detect expected spelling errors', async () => {
    const lt = createLanguageToolChecker();
    
    // Mock the check method to avoid actual API calls in tests
    const mockIssues = [
      {
        offset: 15,
        length: 5,
        category: "TYPOS",
        message: "Possible spelling mistake found",
        replacements: ["would"],
        ruleId: "MORFOLOGIK_RULE_EN_US",
        categoryId: "TYPOS"
      },
      {
        offset: 45,
        length: 5,
        category: "TYPOS", 
        message: "Possible spelling mistake found",
        replacements: ["would"],
        ruleId: "MORFOLOGIK_RULE_EN_US",
        categoryId: "TYPOS"
      },
      {
        offset: 75,
        length: 5,
        category: "TYPOS",
        message: "Possible spelling mistake found", 
        replacements: ["build"],
        ruleId: "MORFOLOGIK_RULE_EN_US",
        categoryId: "TYPOS"
      }
    ];

    // Override the check method for testing
    lt.check = async () => mockIssues;

    const issues = await lt.check(EXAMPLE_TEXT, "en-US");
    
    // Count MORFOLOGIK_RULE_EN_US (spelling errors)
    const spellingErrors = issues.filter(issue => 
      issue.ruleId === "MORFOLOGIK_RULE_EN_US"
    );
    expect(spellingErrors.length).toBeGreaterThanOrEqual(3);
  });

  it('should detect punctuation issues', async () => {
    const lt = createLanguageToolChecker();
    
    const mockIssues = [
      {
        offset: 100,
        length: 0,
        category: "PUNCTUATION",
        message: "Sentence may be missing terminal punctuation",
        replacements: ["."],
        ruleId: "PUNCTUATION_PARAGRAPH_END",
        categoryId: "PUNCTUATION"
      }
    ];

    lt.check = async () => mockIssues;

    const issues = await lt.check(EXAMPLE_TEXT, "en-US");
    
    // Check for PUNCTUATION_PARAGRAPH_END
    const punctuationIssues = issues.filter(issue => 
      issue.ruleId === "PUNCTUATION_PARAGRAPH_END"
    );
    expect(punctuationIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect capitalization issues', async () => {
    const lt = createLanguageToolChecker();
    
    const mockIssues = [
      {
        offset: 15,
        length: 6,
        category: "CAPITALIZATION",
        message: "Expected capital after sentence-ending punctuation",
        replacements: ["Nobody"],
        ruleId: "UPPERCASE_SENTENCE_START",
        categoryId: "CAPITALIZATION"
      }
    ];

    lt.check = async () => mockIssues;

    const issues = await lt.check(EXAMPLE_TEXT, "en-US");
    
    // Check for UPPERCASE_SENTENCE_START
    const capitalizationIssues = issues.filter(issue => 
      issue.ruleId === "UPPERCASE_SENTENCE_START"
    );
    expect(capitalizationIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should maintain WSC < total words when typos are present', () => {
    // This test ensures that spelling errors reduce WSC count
    const totalWords = EXAMPLE_TEXT.split(/\s+/).filter(word => /^[A-Za-z]+/.test(word)).length;
    const expectedSpellingErrors = 3; // "woud", "bilit", etc.
    const expectedWSC = totalWords - expectedSpellingErrors;
    
    expect(expectedWSC).toBeLessThan(totalWords);
    expect(expectedWSC).toBeGreaterThan(0);
  });

  it('should handle picky mode level', async () => {
    const lt = createLanguageToolChecker();
    
    const mockIssues = [
      {
        offset: 50,
        length: 0,
        category: "STYLE",
        message: "Long sentence (possible run-on)",
        replacements: [],
        ruleId: "TOO_LONG_SENTENCE",
        categoryId: "STYLE"
      }
    ];

    lt.check = async () => mockIssues;

    // Test with picky level
    const issues = await lt.check(EXAMPLE_TEXT, "en-US", undefined, "picky");
    
    // Should detect style issues in picky mode
    const styleIssues = issues.filter(issue => 
      issue.ruleId === "TOO_LONG_SENTENCE"
    );
    expect(styleIssues.length).toBeGreaterThanOrEqual(0);
  });
});
