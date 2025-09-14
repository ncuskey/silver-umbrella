import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import vision from '@google-cloud/vision';

export const runtime = 'nodejs';

const client = new vision.ImageAnnotatorClient({
  projectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  credentials: {
    client_email: process.env.GCP_CLIENT_EMAIL || process.env.GOOGLE_CLOUD_SA_EMAIL,
    private_key: (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
});

async function preprocessForOCR(input: Buffer) {
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
      img = img.resize({ width: (meta.width || 0) * 2, height: (meta.height || 0) * 2, kernel: 'lanczos3' });
    }
  } catch {}

  // Return both buffer and output info for dimensions
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return { buffer: data, info } as { buffer: Buffer; info: sharp.OutputInfo };
}

function extractBase64(data: string): string {
  const i = data.indexOf('base64,');
  return i >= 0 ? data.slice(i + 'base64,'.length) : data;
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, imageUri, lang } = await req.json();
    if (!imageBase64 && !imageUri) {
      return NextResponse.json({ error: 'imageBase64 or imageUri is required' }, { status: 400 });
    }

    const request: any = { imageContext: lang ? { languageHints: [lang] } : undefined };

    if (imageUri) {
      request.image = { source: { imageUri } };
    } else {
      const b64 = extractBase64(String(imageBase64));
      const buf = Buffer.from(b64, 'base64');
      const pre = await preprocessForOCR(buf);
      request.image = { content: pre.buffer };
      // Attach preprocessed image for client-side cropping alignment
      (request as any).__preBase64 = `data:image/png;base64,${pre.buffer.toString('base64')}`;
      (request as any).__preInfo = pre.info;
    }

    const [result] = await client.documentTextDetection(request as any);
    return NextResponse.json({
      text: result?.fullTextAnnotation?.text ?? '',
      raw: result,
      preprocessedImageBase64: (request as any).__preBase64 ?? null,
      preprocessedInfo: (request as any).__preInfo ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'OCR failed' }, { status: 500 });
  }
}
