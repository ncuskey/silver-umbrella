import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const p = await ctx.params;
    const segments = Array.isArray(p.path) ? p.path : [p.path as any];
    const safeRel = segments.join('/').replace(/\\/g, '/').replace(/\.\.+/g, '');
    const filePath = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', safeRel);
    const data = await readFile(filePath);
    let contentType = 'application/octet-stream';
    if (safeRel.endsWith('.mjs')) contentType = 'text/javascript; charset=utf-8';
    else if (safeRel.endsWith('.map')) contentType = 'application/json; charset=utf-8';
    return new Response(data as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
