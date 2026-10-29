import { NextResponse } from "next/server";
import sharp from "sharp";
import { RECIPES } from "@/lib/recipes";
import { loadBrand, loadBrandSafety, loadCopyLines, loadProduct, protectMaskPath } from "@/lib/server/catalog";
import { cachedKit } from "@/lib/server/brand-extract";
import { GENERATION_MODE } from "@/lib/server/config";
import type { StudioData } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

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
    return NextResponse.json({
      mode: GENERATION_MODE,
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
