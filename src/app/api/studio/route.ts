import { NextResponse } from "next/server";
import sharp from "sharp";
import { RECIPES } from "@/lib/recipes";
import { loadBrand, loadBrandSafety, loadCopyLines, loadProduct, protectMaskPath } from "@/lib/server/catalog";
import { cachedKit } from "@/lib/server/cached-kit";
import { GENERATION_MODE } from "@/lib/server/config";
import { liveStatus } from "@/lib/server/live";
import { currentVisitor } from "@/lib/server/visitor";
import type { StudioData } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assetUrl = (name: string): string => `/api/assets/${encodeURIComponent(name)}`;

async function protectedShare(maskPath: string): Promise<number> {
  const { data } = await sharp(maskPath).greyscale().raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (const value of data) if (value > 127) on++;
  return on / data.length;
}

export async function GET(): Promise<NextResponse<StudioData | ApiError>> {
  try {
    const [brand, product, safety, copyLines] = await Promise.all([loadBrand(), loadProduct(), loadBrandSafety(), loadCopyLines()]);
    const share = product.protectMask ? await protectedShare(protectMaskPath(product)) : null;
    const live = await liveStatus(await currentVisitor());
    return NextResponse.json({
      mode: live.live ? "live" : GENERATION_MODE === "live" ? "demo" : GENERATION_MODE,
      live,
      brand: await cachedKit(brand, assetUrl(brand.logo)),
      directionCatalog: brand.sceneDirections,
      product: {
        name: product.name,
        description: product.description,
        photoUrl: assetUrl(product.primaryPhoto),
        protectMaskUrl: product.protectMask ? `${assetUrl(product.protectMask)}?alpha=1` : null,
        protectedShare: share,
        reveal: product.reveal ? { startUrl: assetUrl(product.reveal.start), endUrl: assetUrl(product.reveal.end) } : null,
      },
      recipes: RECIPES,
      safety,
      copyLines,
    });
  } catch (error: unknown) {
    console.error("studio load failed", error);
    return NextResponse.json({ error: "Could not load the brand kit and product." }, { status: 500 });
  }
}
