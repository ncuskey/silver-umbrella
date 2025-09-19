#!/usr/bin/env node
/*
 OCR + LanguageTool scoring CLI
 Usage:
   node scripts/ocr-score.js --input path/to/image.jpg [--lang en] [--output out.json]

 Env:
   - LT_ENDPOINT (optional, default: http://127.0.0.1:8010/v2/check)
   - FIXER_URL (optional, default: http://127.0.0.1:8085/fix)
  - Reads `.env.local` if present
*/

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const Tesseract = require('tesseract.js');

// Load env from .env.local if present
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not found or .env.local missing; silently proceed
}

function parseArgs(argv) {
  const args = { lang: 'en', output: null, input: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') {
      args.input = argv[++i];
    } else if (a === '--lang' || a === '-l') {
      args.lang = argv[++i];
    } else if (a === '--output' || a === '-o') {
      args.output = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`\nOCR + LanguageTool CLI\n\nUsage:\n  node scripts/ocr-score.js --input <image> [--lang en] [--output out.json]\n\nOptions:\n  -i, --input    Path to image file (jpg, png, tif, bmp)\n  -l, --lang     Language hint (default: en -> eng)\n  -o, --output   Output JSON path (default: print to stdout)\n  -h, --help     Show help\n\nEnv:\n  LT_ENDPOINT   Override LanguageTool endpoint (default: http://127.0.0.1:8010/v2/check)\n  FIXER_URL     Optional fixer URL for irregular verb cleanup (default: http://127.0.0.1:8085/fix)\n`);
}

function isoNow() {
  return new Date().toISOString();
}

function mapLangToTesseract(lang) {
  // basic mapping: 'en' or 'en-US' -> 'eng'
  const lower = (lang || '').toLowerCase();
  if (lower.startsWith('en')) return 'eng';
  // extend as needed
  return 'eng';
}

function isSupportedImage(file) {
  const ext = path.extname(file).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.gif'].includes(ext);
}

async function ocrImage(filePath, lang) {
  const tessLang = mapLangToTesseract(lang);
  const start = Date.now();
  const result = await Tesseract.recognize(filePath, tessLang);
  const durationMs = Date.now() - start;
  const words = Array.isArray(result?.data?.words) ? result.data.words : [];
  const avgConfidence = words.length
    ? words.reduce((acc, w) => acc + (w.confidence || 0), 0) / words.length
    : (typeof result?.data?.confidence === 'number' ? result.data.confidence : null);
  return {
    text: result?.data?.text || '',
    durationMs,
    confidence: avgConfidence != null ? Number(avgConfidence.toFixed(2)) : null,
    raw: undefined, // omit heavy raw data by default
  };
}

function calcTextStats(text) {
  const chars = text.length;
  const words = (text.trim().match(/\b\w+\b/g) || []).length;
  const sentences = (text.match(/[.!?]+\s|\n/g) || []).length + (text.trim() ? 1 : 0);
  return { chars, words, sentences };
}

async function languageToolCheck(text, lang) {
  const endpoint = process.env.LT_ENDPOINT || 'http://127.0.0.1:8010/v2/check';
  const params = new URLSearchParams();
  params.append('text', text);
  params.append('language', lang.toLowerCase().startsWith('en') ? 'en-US' : lang);
  params.append('level', 'picky');
  params.append('enabledOnly', 'false');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LanguageTool request failed: ${res.status} ${res.statusText} ${body ? '- ' + body : ''}`);
  }
  return await res.json();
}

function scoreFromMatches(matches, textStats) {
  const errors = Array.isArray(matches) ? matches.length : 0;
  const words = textStats.words || 0;
  // Simple heuristic: more words tolerate more errors. One error per ~50 words subtracts ~2 points.
  const denom = Math.max(1, words + 5);
  let score = 100 - Math.round((errors / denom) * 100);
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return score;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const filePath = path.resolve(process.cwd(), args.input);
  if (!fs.existsSync(filePath)) {
    console.error(`Input not found: ${filePath}`);
    process.exit(1);
  }
  if (!isSupportedImage(filePath)) {
    console.error(`Unsupported file type for OCR: ${filePath}\nTip: convert PDFs to images (PNG/JPG) before running.`);
    process.exit(1);
  }

  console.error(`[${isoNow()}] OCR starting: ${filePath}`);
  const ocr = await ocrImage(filePath, args.lang);
  const text = (ocr.text || '').trim();
  console.error(`[${isoNow()}] OCR done in ${ocr.durationMs} ms; chars=${text.length}`);

  const stats = calcTextStats(text);
  let grammar = null;
  let score = null;
  let fixer = null;
  if (text) {
    try {
      console.error(`[${isoNow()}] LanguageTool check…`);
      grammar = await languageToolCheck(text, args.lang);
      const matches = grammar?.matches || [];
      score = scoreFromMatches(matches, stats);
      console.error(`[${isoNow()}] LanguageTool found ${matches.length} issue(s); score=${score}`);
    } catch (err) {
      console.error(`[${isoNow()}] LanguageTool error: ${err.message}`);
    }

    try {
      const fixerUrl = process.env.FIXER_URL || 'http://127.0.0.1:8085/fix';
      console.error(`[${isoNow()}] Fixer sanity check via ${fixerUrl}…`);
      const resp = await fetch(fixerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        fixer = await resp.json();
      } else {
        console.error(`[${isoNow()}] Fixer returned ${resp.status}`);
      }
    } catch (err) {
      console.error(`[${isoNow()}] Fixer error: ${err.message}`);
    }
  }

  const output = {
    input: filePath,
    language: args.lang,
    ocr: {
      durationMs: ocr.durationMs,
      confidence: ocr.confidence,
      text,
    },
    textStats: stats,
    grammar: grammar ? {
      matches: grammar.matches,
      software: grammar.software,
      language: grammar.language,
    } : null,
    fixer,
    score,
    timestamp: isoNow(),
  };

  if (args.output) {
    const outPath = path.resolve(process.cwd(), args.output);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(outPath);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
