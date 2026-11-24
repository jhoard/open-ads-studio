import { NextResponse } from "next/server";
import type { BrandKit } from "@/lib/brand-kit";
import { CrawlInputError, crawlBrand } from "@/lib/server/brand-extract";
import { loadBrand } from "@/lib/server/catalog";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_URL_LENGTH = 300;

interface BrandResponse {
  kit: BrandKit;
  /** Any extraction details the user should review. */
  notice: string | null;
}

export async function POST(request: Request): Promise<NextResponse<BrandResponse | ApiError>> {
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (typeof body.url !== "string" || !body.url.trim() || body.url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ error: "Paste a website address." }, { status: 400 });
  }

  const brand = await loadBrand();
  try {
    return NextResponse.json({ kit: await crawlBrand(body.url, brand.sceneDirections), notice: null });
  } catch (error: unknown) {
    if (error instanceof CrawlInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("brand crawl failed");
    return NextResponse.json({ error: "We could not read that website. It may block automated access or be taking too long. Retry, or upload your brand's .md file. Your current kit has been kept." }, { status: 502 });
  }
}
