import { tokenize } from "@/lib/tokenize";
import type { Token } from "@/lib/types";
import {
  DEFAULT_ABBREVIATIONS,
  DEFAULT_PROPER_NOUNS,
  DEFAULT_DICTIONARY,
  DEFAULT_NUMBER_SYMBOLS,
  OPENING_QUOTES,
  CLOSING_QUOTES,
  OPENING_BRACKETS,
  CLOSING_BRACKETS,
} from "@/data/cbmDictionaries";

export type HeuristicSeverity = "error" | "warning";

export interface HeuristicIssue {
  rule: string;
  severity: HeuristicSeverity;
  message: string;
  tokenIndices?: number[];
  boundaryIndex?: number;
  span?: [number, number];
  suggestion?: string;
}

export interface SentenceInfo {
  index: number;
  startToken: number;
  endToken: number;
  startOffset: number;
  endOffset: number;
  hasTerminalPunctuation: boolean;
  reason: "terminator" | "newline" | "capital" | "eof";
}

export interface NumberTokenInfo {
  tokenIndex: number;
  kind: "ordinal" | "cardinal" | "time" | "date" | "fraction" | "currency" | "mixed";
  raw: string;
}

export interface HeuristicsMetadata {
  unknownWordIndices: number[];
  properNounSuggestions: number[];
  numberTokens: NumberTokenInfo[];
}

export interface HeuristicsOptions {
  abbreviations?: Iterable<string>;
  properNouns?: Iterable<string>;
  dictionary?: Iterable<string>;
  allowOxfordComma?: boolean;
  allowPoetryCase?: boolean;
  allowMultipleSpaces?: boolean;
  treatOrdinalAsWord?: boolean;
}

export interface HeuristicsResult {
  tokens: Token[];
  sentences: SentenceInfo[];
  wordIssues: HeuristicIssue[];
  boundaryIssues: HeuristicIssue[];
  metadata: HeuristicsMetadata;
}

const SENTENCE_TERMINATORS = new Set([".", "!", "?"]);
const CLOSING_PUNCT_ADJ = new Set([",", ";", ":"]);

function toLower(word: string): string {
  return word.toLowerCase();
}

type WordToken = Token & { type: "WORD" };

function isWordToken(token: Token | undefined): token is WordToken {
  return !!token && token.type === "WORD";
}

function isPunct(token: Token | undefined, value?: string): token is Token {
  if (!token) return false;
  if (token.type !== "PUNCT" && token.type !== "BOUNDARY") return false;
  if (value) return token.raw === value;
  return true;
}

function isUppercaseWord(word: string): boolean {
  if (!word.length) return false;
  const first = word[0];
  return /[A-Z]/.test(first);
}

function isLowercaseWord(word: string): boolean {
  if (!word.length) return false;
  return word === word.toLowerCase();
}

function isOpeningWrapper(token: Token | undefined): boolean {
  return !!token && (OPENING_QUOTES.has(token.raw) || OPENING_BRACKETS.has(token.raw));
}

function isClosingWrapper(token: Token | undefined): boolean {
  return !!token && (CLOSING_QUOTES.has(token.raw) || CLOSING_BRACKETS.has(token.raw));
}

function gapBetween(text: string, left: Token, right: Token): string {
  return text.slice(left.end ?? 0, right.start ?? 0);
}

function trimNewlines(str: string): string {
  return str.replace(/[\r\n]+/g, " ");
}

function looksLikeNumber(raw: string): boolean {
  return /[0-9]/.test(raw);
}

function classifyNumber(raw: string): NumberTokenInfo["kind"] {
  const trimmed = raw.trim();
  if (/^[0-9]+(st|nd|rd|th)$/i.test(trimmed)) return "ordinal";
  if (/^[0-9]+:[0-9]{2}$/.test(trimmed)) return "time";
  if (/^[0-9]{1,2}\/[0-9]{1,2}(\/[0-9]{2,4})?$/.test(trimmed)) return "date";
  if (/^[0-9]+\/[0-9]+$/.test(trimmed)) return "fraction";
  if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) return "cardinal";
  if (/^[0-9]+(\.[0-9]+)?[a-z]+$/i.test(trimmed)) return "mixed";
  return "cardinal";
}

function abbreviationSet(options?: HeuristicsOptions): Set<string> {
  if (options?.abbreviations) {
    return new Set([...DEFAULT_ABBREVIATIONS, ...options.abbreviations].map(toLower));
  }
  return DEFAULT_ABBREVIATIONS;
}

function properNounSet(options?: HeuristicsOptions): Set<string> {
  if (options?.properNouns) {
    return new Set([...DEFAULT_PROPER_NOUNS, ...options.properNouns]);
  }
  return DEFAULT_PROPER_NOUNS;
}

function dictionarySet(options?: HeuristicsOptions): Set<string> {
  if (options?.dictionary) {
    return new Set([...DEFAULT_DICTIONARY, ...options.dictionary].map(toLower));
  }
  return DEFAULT_DICTIONARY;
}

function isAbbreviationCandidate(word: string, punctuation: string, abbreviationLookup: Set<string>): boolean {
  const lowered = `${word.toLowerCase()}${punctuation}`;
  return abbreviationLookup.has(lowered);
}

function extractWordTokens(tokens: Token[], start: number, end: number): Token[] {
  const result: Token[] = [];
  for (let i = start; i <= end; i += 1) {
    if (isWordToken(tokens[i])) result.push(tokens[i]);
  }
  return result;
}

function consumeClosingWrappers(tokens: Token[], startIndex: number, text: string): number {
  let end = startIndex;
  for (let i = startIndex + 1; i < tokens.length; i += 1) {
    const gap = text.slice(tokens[i - 1].end ?? 0, tokens[i].start ?? 0).trim();
    if (!gap && isClosingWrapper(tokens[i])) {
      end = i;
      continue;
    }
    break;
  }
  return end;
}

function detectSentences(text: string, tokens: Token[], options?: HeuristicsOptions): SentenceInfo[] {
  const abbreviationLookup = abbreviationSet(options);
  const sentences: SentenceInfo[] = [];
  let sentenceStart = 0;

  const pushSentence = (endIndex: number, reason: SentenceInfo["reason"], hasTerminator: boolean) => {
    const startToken = sentenceStart;
    const endToken = Math.max(endIndex, startToken);
    const startOffset = tokens[startToken]?.start ?? 0;
    const endOffset = tokens[endToken]?.end ?? text.length;
    sentences.push({
      index: sentences.length,
      startToken,
      endToken,
      startOffset,
      endOffset,
      hasTerminalPunctuation: hasTerminator,
      reason,
    });
    sentenceStart = Math.min(endToken + 1, tokens.length);
    while (sentenceStart < tokens.length && !isWordToken(tokens[sentenceStart]) && !/[A-Za-z0-9]/.test(tokens[sentenceStart].raw)) {
      sentenceStart += 1;
    }
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    let ended = false;
    let endIndex = i;
    let endReason: SentenceInfo["reason"] = "terminator";
    let hasTerminator = false;

    if (SENTENCE_TERMINATORS.has(token.raw)) {
      const prevWord = ((): Token | undefined => {
        for (let j = i - 1; j >= sentenceStart; j -= 1) {
          if (isWordToken(tokens[j])) return tokens[j];
        }
        return undefined;
      })();

      const isAbbrev = prevWord ? isAbbreviationCandidate(prevWord.raw, token.raw, abbreviationLookup) : false;
      if (!isAbbrev) {
        endIndex = consumeClosingWrappers(tokens, i, text);
        ended = true;
        hasTerminator = true;
      }
    }

    if (!ended && next) {
      const gap = text.slice(token.end ?? 0, next.start ?? 0);
      if (/\n\s*\n/.test(gap)) {
        endIndex = i;
        ended = true;
        endReason = "newline";
      } else if (/\n/.test(gap) && !gap.trim()) {
        endIndex = i;
        ended = true;
        endReason = "newline";
      } else if (isWordToken(next) && isUppercaseWord(next.raw)) {
        if (!isClosingWrapper(token) && !SENTENCE_TERMINATORS.has(token.raw)) {
          const gapTrimmed = gap.trim();
          if (gapTrimmed.length === 0 || gapTrimmed === "") {
            // potential new sentence start if previous sentence is long enough
            const lengthTokens = i - sentenceStart + 1;
            if (lengthTokens >= 6) {
              endIndex = i;
              ended = true;
              endReason = "capital";
            }
          }
        }
      }
    }

    if (!ended && i === tokens.length - 1) {
      endIndex = i;
      endReason = "eof";
      ended = true;
    }

    if (ended) {
      pushSentence(endIndex, endReason, hasTerminator);
      i = Math.max(endIndex, sentenceStart - 1);
    }
  }

  if (sentences.length === 0 && tokens.length > 0) {
    pushSentence(tokens.length - 1, "eof", false);
  }

  return sentences;
}

function checkSpacingAndCapitalization(
  text: string,
  tokens: Token[],
  sentences: SentenceInfo[],
  options?: HeuristicsOptions
): { boundaryIssues: HeuristicIssue[]; wordIssues: HeuristicIssue[] } {
  const issues: HeuristicIssue[] = [];
  const wordIssues: HeuristicIssue[] = [];
  const allowExtraSpaces = options?.allowMultipleSpaces ?? false;
  const allowPoetry = options?.allowPoetryCase ?? false;
  const allowOxford = options?.allowOxfordComma ?? true;

  const sentenceStarts = new Set<number>();
  for (const sentence of sentences) {
    for (let i = sentence.startToken; i <= sentence.endToken; i += 1) {
      if (isWordToken(tokens[i])) {
        sentenceStarts.add(i);
        break;
      }
    }
  }

  const firstWordIssues = new Map<number, HeuristicIssue>();
  const properNouns = properNounSet(options);

  for (const sentence of sentences) {
    for (let i = sentence.startToken; i <= sentence.endToken; i += 1) {
      const tok = tokens[i];
      if (!isWordToken(tok)) continue;
      const normalized = tok.raw.replace(/^["“‘(\[]+/, "");
      if (!normalized) continue;
      if (allowPoetry) break;
      if (!isUppercaseWord(normalized) && !properNouns.has(normalized)) {
        const issue: HeuristicIssue = {
          rule: "CWS_SENTENCE_CAPITALIZATION",
          severity: "error",
          message: "Sentence should begin with a capital letter",
          tokenIndices: [tok.idx],
          span: [tok.start ?? 0, tok.end ?? 0],
        };
        wordIssues.push(issue);
        firstWordIssues.set(tok.idx, issue);
      }
      break;
    }
  }

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const left = tokens[i];
    const right = tokens[i + 1];
    const boundaryIndex = i + 1;
    const gap = gapBetween(text, left, right);
    const trimmedGap = trimNewlines(gap);

    if (isWordToken(left) && isWordToken(right)) {
      if (!trimmedGap.trim()) {
        const issue: HeuristicIssue = {
          rule: "CWS_SPACE_MISSING",
          severity: "error",
          message: "Missing space between words",
          boundaryIndex,
          tokenIndices: [left.idx, right.idx],
          span: [left.end ?? 0, right.start ?? 0],
        };
        issues.push(issue);
      } else if (!allowExtraSpaces && trimmedGap.length > 1) {
        issues.push({
          rule: "CWS_SPACE_EXTRA",
          severity: "warning",
          message: "Extra spacing between words",
          boundaryIndex,
          tokenIndices: [left.idx, right.idx],
          span: [left.end ?? 0, right.start ?? 0],
        });
      }
      continue;
    }

    if (isWordToken(left) && SENTENCE_TERMINATORS.has(right.raw)) {
      // allow
      continue;
    }

    if (isWordToken(left) && CLOSING_PUNCT_ADJ.has(right.raw)) {
      if (trimmedGap.length !== 0) {
        issues.push({
          rule: "CWS_NO_SPACE_BEFORE_PUNCT",
          severity: "error",
          message: `Remove space before '${right.raw}'`,
          boundaryIndex,
          tokenIndices: [left.idx, right.idx],
          span: [left.end ?? 0, right.start ?? 0],
        });
      }
      continue;
    }

    if (CLOSING_PUNCT_ADJ.has(left.raw) && isWordToken(right)) {
      const allowNoSpace = allowOxford && left.raw === "," && (right.raw === "and" || right.raw === "or");
      if (!allowNoSpace && !trimmedGap.trim()) {
        issues.push({
          rule: "CWS_SPACE_AFTER_PUNCT",
          severity: "error",
          message: `Add a space after '${left.raw}'`,
          boundaryIndex,
          tokenIndices: [left.idx, right.idx],
          span: [left.end ?? 0, right.start ?? 0],
        });
      }
      continue;
    }

    if (SENTENCE_TERMINATORS.has(left.raw)) {
      if (!trimmedGap.trim() && !isClosingWrapper(right)) {
        issues.push({
          rule: "CWS_SPACE_AFTER_TERMINATOR",
          severity: "warning",
          message: "Add a space after sentence-ending punctuation",
          boundaryIndex,
          tokenIndices: [left.idx, right.idx],
          span: [left.end ?? 0, right.start ?? 0],
        });
      }
      continue;
    }

    if (isOpeningWrapper(left) && isWordToken(right)) {
      if (!trimmedGap.trim()) {
        issues.push({
          rule: "CWS_SPACE_AFTER_WRAPPER",
          severity: "error",
          message: `Add a space after '${left.raw}'`,
          boundaryIndex,
          tokenIndices: [left.idx, right.idx],
          span: [left.end ?? 0, right.start ?? 0],
        });
      }
      continue;
    }

    if (isWordToken(left) && isClosingWrapper(right)) {
      if (trimmedGap.length !== 0) {
        issues.push({
          rule: "CWS_SPACE_BEFORE_WRAPPER",
          severity: "warning",
          message: `Remove space before '${right.raw}'`,
          boundaryIndex,
          tokenIndices: [left.idx, right.idx],
          span: [left.end ?? 0, right.start ?? 0],
        });
      }
    }
  }

  return { boundaryIssues: issues, wordIssues };
}

function collectDictionaryMetadata(
  tokens: Token[],
  dictionary: Set<string>,
  properNouns: Set<string>,
  options?: HeuristicsOptions
): { unknownWordIndices: number[]; properNounSuggestions: number[]; numberTokens: NumberTokenInfo[] } {
  const unknownWordIndices: number[] = [];
  const properNounSuggestions: number[] = [];
  const numberTokens: NumberTokenInfo[] = [];
  const treatOrdinals = options?.treatOrdinalAsWord ?? true;

  tokens.forEach((token, idx) => {
    if (isWordToken(token)) {
      const cleaned = token.raw.replace(/^[\"“‘(\[]+/, "").replace(/[\"”’)\]]+$/, "");
      if (!cleaned) return;
      const lower = cleaned.toLowerCase();
      if (looksLikeNumber(cleaned)) {
        const kind = classifyNumber(cleaned);
        numberTokens.push({ tokenIndex: idx, kind, raw: cleaned });
        if (!treatOrdinals && kind === "ordinal") {
          unknownWordIndices.push(idx);
        }
        return;
      }
      if (properNouns.has(cleaned)) {
        properNounSuggestions.push(idx);
        return;
      }
      if (!dictionary.has(lower)) {
        unknownWordIndices.push(idx);
      }
    } else if (DEFAULT_NUMBER_SYMBOLS.has(token.raw)) {
      numberTokens.push({ tokenIndex: idx, kind: "currency", raw: token.raw });
    }
  });

  return { unknownWordIndices, properNounSuggestions, numberTokens };
}

export function analyzeText(text: string, options?: HeuristicsOptions): HeuristicsResult {
  const tokens = tokenize(text);
  const sentences = detectSentences(text, tokens, options);
  const spacingResults = checkSpacingAndCapitalization(text, tokens, sentences, options);
  const dictionary = dictionarySet(options);
  const properNouns = properNounSet(options);
  const metadata = collectDictionaryMetadata(tokens, dictionary, properNouns, options);

  return {
    tokens,
    sentences,
    wordIssues: [...spacingResults.wordIssues],
    boundaryIssues: spacingResults.boundaryIssues,
    metadata,
  };
}

export type { HeuristicsOptions as CbmHeuristicsOptions };
