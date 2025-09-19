import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

export const runtime = 'nodejs';

type PreprocessResult = { buffer: Buffer; info: sharp.OutputInfo };

async function preprocessForOCR(input: Buffer): Promise<PreprocessResult> {
  let img = sharp(input, { failOn: 'none' }).rotate();

  img = img
    .grayscale()
    .normalize()
    .median(1)
    .gamma(1.1)
    .sharpen(0.5)
    .threshold(180, { grayscale: true })
    .trim()
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#FFFFFF' })
    .png({ compressionLevel: 9, palette: false });

  try {
    const meta = await sharp(input).metadata();
    const minDim = Math.max(meta.width || 0, meta.height || 0);
    if (minDim && minDim < 900) {
      img = img.resize({
        width: (meta.width || 0) * 2,
        height: (meta.height || 0) * 2,
        kernel: 'lanczos3'
      });
    }
  } catch {}

  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return { buffer: data, info };
}

function extractBase64(data: string): string {
  const i = data.indexOf('base64,');
  return i >= 0 ? data.slice(i + 'base64,'.length) : data;
}

function normalizeLang(lang: string | undefined): string {
  if (!lang) return 'eng';
  const lower = lang.toLowerCase();
  if (lower === 'en' || lower === 'en-us' || lower === 'en_us') return 'eng';
  return lower;
}

type WordBBox = { x0: number; y0: number; x1: number; y1: number };
type WordSpan = {
  text: string;
  start: number;
  end: number;
  confidence: number | null;
  pageIndex: number;
  bbox: WordBBox;
};

function buildWordSpans(text: string, words: any[]): WordSpan[] {
  if (!Array.isArray(words) || !text) return [];
  let cursor = 0;
  const spans: WordSpan[] = [];

  for (const w of words) {
    const raw = (w?.text ?? '').trim();
    if (!raw) continue;
    const idx = text.indexOf(raw, cursor);
    if (idx === -1) continue;
    const end = idx + raw.length;
    cursor = end;

    const bboxSrc = w?.bbox || {};
    const bbox: WordBBox = {
      x0: Number(bboxSrc.x0 ?? bboxSrc.x1 ?? 0),
      y0: Number(bboxSrc.y0 ?? bboxSrc.y1 ?? 0),
      x1: Number(bboxSrc.x1 ?? bboxSrc.x0 ?? 0),
      y1: Number(bboxSrc.y1 ?? bboxSrc.y0 ?? 0),
    };

    spans.push({
      text: raw,
      start: idx,
      end,
      confidence: typeof w?.confidence === 'number' ? w.confidence : null,
      pageIndex: Number.isFinite(w?.page) ? Math.max(0, Number(w.page) - 1) : 0,
      bbox,
    });
  }

  return spans;
}

async function bufferFromUri(imageUri: string): Promise<Buffer> {
  const res = await fetch(imageUri);
  if (!res.ok) throw new Error(`Failed to fetch image URI (${res.status})`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, imageUri, lang } = await req.json();
    if (!imageBase64 && !imageUri) {
      return NextResponse.json({ error: 'imageBase64 or imageUri is required' }, { status: 400 });
    }

    const tessLang = normalizeLang(lang);

    let sourceBuffer: Buffer;
    if (imageUri) {
      sourceBuffer = await bufferFromUri(String(imageUri));
    } else {
      const b64 = extractBase64(String(imageBase64));
      sourceBuffer = Buffer.from(b64, 'base64');
    }

    const pre = await preprocessForOCR(sourceBuffer);
    const preBase64 = `data:image/png;base64,${pre.buffer.toString('base64')}`;

    const { data } = await Tesseract.recognize(pre.buffer, tessLang, {
      logger: () => undefined,
    });

    const text = (data?.text ?? '').trimEnd();
    const spans = buildWordSpans(text, data?.words ?? []);

    return NextResponse.json({
      engine: 'tesseract',
      lang: tessLang,
      text,
      words: spans,
      confidence: typeof data?.confidence === 'number' ? data.confidence : null,
      preprocessedImageBase64: preBase64,
      preprocessedInfo: pre.info,
      raw: {
        confidence: data?.confidence,
        words: (data?.words ?? []).map((w: any) => ({
          text: w?.text ?? '',
          confidence: w?.confidence ?? null,
          bbox: w?.bbox ?? null,
          page: w?.page ?? null,
        })),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'OCR failed' }, { status: 500 });
  }
}
