import { NextRequest } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';

// Lazy import to avoid blocking cold start
async function getVisionClient() {
  const vision = await import('@google-cloud/vision');
  const { ImageAnnotatorClient } = vision as any;

  // Support credentials via env JSON or default ADC
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (json) {
    try {
      const creds = JSON.parse(json);
      const client = new ImageAnnotatorClient({
        credentials: creds,
        projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
      });
      return client;
    } catch (e) {
      console.warn('[vision] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON; falling back to ADC');
    }
  }
  return new ImageAnnotatorClient();
}

async function preprocessForOCR(input: Buffer) {
  // Heuristic pipeline: autorotate, grayscale, normalize, denoise, adaptive threshold, trim + small padding
  // Returns PNG buffer for best OCR compatibility
  let img = sharp(input, { failOn: 'none' }).rotate(); // autorotate via EXIF

  img = img
    .grayscale()
    .normalize()          // stretch contrast
    .median(1)            // mild denoise
    .gamma(1.1)           // slight gamma boost
    .sharpen(0.5)         // mild sharpen
    .threshold(180, { grayscale: true }) // binarize-ish
    .trim()               // crop uniform margins
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#FFFFFF' })
    .png({ compressionLevel: 9, palette: false });

  // Ensure a minimum size for small scans (upsample lightly if tiny)
  const meta = await sharp(input).metadata();
  const minDim = Math.max(meta.width || 0, meta.height || 0);
  if (minDim && minDim < 900) {
    img = img.resize({ width: (meta.width || 0) * 2, height: (meta.height || 0) * 2, kernel: 'lanczos3' });
  }

  return img.toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files: File[] = [];
    for (const key of ['file', 'files']) {
      const vals = form.getAll(key);
      for (const v of vals) if (v instanceof File) files.push(v);
    }
    if (files.length === 0) return new Response(JSON.stringify({ error: 'No files uploaded' }), { status: 400 });

    const langHint = (form.get('lang') as string) || 'en';
    const client = await getVisionClient();

    const pages: { bytes: number; text: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const buf = Buffer.from(await f.arrayBuffer());
      const pre = await preprocessForOCR(buf);

      const [result] = await client.documentTextDetection({
        image: { content: pre },
        imageContext: { languageHints: [langHint] },
      } as any);

      const text = result?.fullTextAnnotation?.text || (result?.textAnnotations?.[0]?.description ?? '');
      pages.push({ bytes: pre.byteLength, text: text || '' });
    }

    const combined = pages.map(p => p.text.trim()).filter(Boolean).join('\n\n');
    return new Response(JSON.stringify({ text: combined, pages }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[vision ocr] error', err);
    return new Response(JSON.stringify({ error: err?.message || 'OCR failed' }), { status: 500 });
  }
}
