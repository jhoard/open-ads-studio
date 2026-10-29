import { NextResponse } from "next/server";
import type { BrandKit } from "@/lib/brand-kit";
import { CrawlInputError, cachedKit, crawlBrand } from "@/lib/server/brand-extract";
import { loadBrand } from "@/lib/server/catalog";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_URL_LENGTH = 300;

interface BrandResponse {
  kit: BrandKit;
  /** Set when the crawl failed and the cached kit stands in. */
  notice: string | null;
}

export async function POST(request: Request): Promise<NextResponse<BrandResponse | ApiError>> {
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
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
    console.error("brand crawl failed", body.url, error);
    const reason = error instanceof Error ? error.message.split("\n")[0].slice(0, 160) : "unknown error";
    return NextResponse.json({
      kit: await cachedKit(brand, `/api/assets/${encodeURIComponent(brand.logo)}`),
      notice: `The crawl did not finish (${reason}). The cached Tauvel kit is loaded instead.`,
    });
  }
}
