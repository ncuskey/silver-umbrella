/**
 * Legacy GrammarBot endpoint placeholder.
 * Returns 410 Gone directing callers to /api/languagetool/v1/check.
 */

import { NextResponse } from "next/server";

let warned = false;

function warnOnce() {
  if (!warned) {
    warned = true;
    console.warn("/api/grammarbot/v1/check is deprecated. Use /api/languagetool/v1/check instead.");
  }
}

export async function POST() {
  warnOnce();
  return NextResponse.json(
    { error: "GrammarBot removed. Use /api/languagetool/v1/check" },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export async function GET() {
  warnOnce();
  return NextResponse.json(
    { error: "GrammarBot removed. Use /api/languagetool/v1/check" },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
