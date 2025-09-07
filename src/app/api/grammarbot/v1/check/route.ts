import { NextRequest, NextResponse } from "next/server";

const GB_URL = "https://neural.grammarbot.io/v1/check";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  const apiKey = process.env.GRAMMARBOT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing GRAMMARBOT_API_KEY" }, { status: 500 });

  const upstream = await fetch(GB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, api_key: apiKey }),
  });

  const json = await upstream.json();
  return NextResponse.json(json, { status: upstream.status });
}
