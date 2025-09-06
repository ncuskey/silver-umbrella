import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text(); // x-www-form-urlencoded passthrough
  const upstream = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await upstream.json();
  return NextResponse.json(json, { status: upstream.status });
}