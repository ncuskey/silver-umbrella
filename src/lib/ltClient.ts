export type LtMatch = {
  message: string;
  offset: number;
  length: number;
  rule: { id: string; description: string; issueType?: string };
};

export type LtEdit = {
  start: number;
  end: number;
  message: string;
  ruleId: string;
  replace?: string;
  err_cat?: 'SPELL' | 'GRMR' | 'PUNC' | 'STYLE' | 'CASING' | 'OTHER';
  err_type?: string;
  err_desc?: string;
  severity?: 'INFO' | 'WARN' | 'ERROR';
  suggestions?: string[];
  edit_type?: 'INSERT' | 'DELETE' | 'MODIFY' | 'REPLACE';
};

export type LtResponse = {
  matches: LtMatch[];
  edits?: LtEdit[];
};

export class LtClientRebuildError extends Error {
  status: number;

  constructor(status: number) {
    super("LanguageTool endpoint missing. Rebuild the project to refresh API routes.");
    this.name = "LtClientRebuildError";
    this.status = status;
  }
}

type LtCategory = { id?: string; name?: string };

function classifyLt(match: LtMatch): { err_cat: LtEdit['err_cat']; err_type: string } {
  const rid = (match.rule?.id || '').toUpperCase();
  const issue = (match.rule?.issueType || '').toUpperCase();
  const category: LtCategory = ((match as any).rule?.category || (match as any).category || {}) as LtCategory;
  const catId = (category.id || '').toUpperCase();
  const catName = (category.name || '').toUpperCase();
  const msg = (match.message || '').toUpperCase();

  const is = (...parts: string[]) =>
    parts.some(p => p && (rid.includes(p) || catId.includes(p) || catName.includes(p) || msg.includes(p)));

  let err_cat: LtEdit['err_cat'] = 'OTHER';
  if (issue === 'MISSPELLING' || is('MORFOLOGIK', 'SPELL', 'TYPOS')) err_cat = 'SPELL';
  else if (issue === 'GRAMMAR' || is('GRAMMAR', 'AGREEMENT', 'CONJUGATION', 'TENSE', 'SVA')) err_cat = 'GRMR';
  else if (is('PUNCT', 'PUNCTUATION', 'COMMA', 'APOSTROPHE', 'QUOTES', 'DASH', 'HYPHEN', 'WHITESPACE')) err_cat = 'PUNC';
  else if (is('CASE', 'CASING', 'UPPERCASE', 'LOWERCASE')) err_cat = 'CASING';
  else if (issue === 'STYLE' || is('STYLE', 'REDUNDANCY', 'CLARITY', 'WORDINESS')) err_cat = 'STYLE';

  let err_type = rid || 'GENERAL';
  if (err_cat === 'PUNC') {
    if (is('COMMA')) err_type = 'COMMA';
    else if (is('APOSTROPHE')) err_type = 'APOSTROPHE';
    else if (is('HYPHEN', 'DASH')) err_type = 'HYPHEN';
    else if (is('QUOTE')) err_type = 'QUOTES';
    else if (is('WHITESPACE', 'SPACE')) err_type = 'WHITESPACE';
  } else if (err_cat === 'GRMR' && is('AGREEMENT', 'SVA')) {
    err_type = 'AGREEMENT';
  } else if (err_cat === 'SPELL') {
    err_type = 'MISSPELLING';
  } else if (err_cat === 'CASING') {
    err_type = 'CASING';
  } else if (err_cat === 'STYLE') {
    err_type = 'STYLE';
  }

  return { err_cat, err_type };
}

function deriveEditType(len: number, replace?: string): 'INSERT' | 'DELETE' | 'MODIFY' | 'REPLACE' {
  const hasLen = len > 0;
  const hasRep = !!(replace && replace.length);
  if (!hasLen && hasRep) return 'INSERT';
  if (hasLen && !hasRep) return 'DELETE';
  return 'MODIFY';
}

function toLegacyEdit(match: LtMatch): LtEdit {
  const start = Math.max(0, match.offset);
  const end = Math.max(start, start + Math.max(0, match.length));
  const message = (match.message || match.rule?.description || "Issue").trim();
  const ruleId = match.rule?.id || "LT";
  const { err_cat, err_type } = classifyLt(match);
  const replacements = (match as any)?.replacements;
  const firstReplacement = Array.isArray(replacements)
    ? (typeof replacements[0] === 'string' ? replacements[0] : replacements[0]?.value)
    : undefined;
  const suggestions = Array.isArray(replacements)
    ? replacements.map((r: any) => (typeof r === 'string' ? r : r?.value)).filter(Boolean)
    : [];
  const edit_type = deriveEditType(match.length ?? (end - start), firstReplacement);

  return {
    start,
    end,
    message,
    ruleId,
    replace: firstReplacement,
    err_cat,
    err_type,
    err_desc: match.message || match.rule?.description || '',
    severity: 'WARN',
    suggestions,
    edit_type,
  };
}

export async function checkWithLanguageTool(text: string, language = "en-US"): Promise<LtResponse> {
  try {
    const res = await fetch("/api/languagetool/v1/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });

    if (res.status === 404 || res.status === 410) {
      throw new LtClientRebuildError(res.status);
    }

    if (!res.ok) {
      return { matches: [] };
    }

    const data = await res.json().catch(() => ({}));
    const matches = Array.isArray(data?.matches) ? (data.matches as LtMatch[]) : [];
    const edits = matches.map(toLegacyEdit);

    return { matches, edits };
  } catch (error) {
    if (error instanceof LtClientRebuildError) {
      throw error;
    }
    return { matches: [], edits: [] };
  }
}
