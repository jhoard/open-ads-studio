import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrandKit } from "@/lib/brand-kit";
import type { Brand } from "@/lib/types";

// Kept apart from the crawler so pages that only need the preloaded kit never load a browser.

/** The preloaded Tauvel kit, with its cached DESIGN.md. */
export async function cachedKit(brand: Brand, logoUrl: string): Promise<BrandKit> {
  const designMd = await readFile(path.join(process.cwd(), "assets", "tauvel", "DESIGN.md"), "utf8");
  const hex = (token: string): string | undefined => brand.palette.find((color) => color.token === token)?.hex;
  return {
    ...brand,
    logoUrl,
    logoKind: "mask",
    heroImages: [],
    theme: { surface: hex("bottle-green") ?? brand.palette[0].hex, accent: hex("brushed-gold") ?? brand.palette[1].hex },
    source: "cached",
    designMd,
  };
}
