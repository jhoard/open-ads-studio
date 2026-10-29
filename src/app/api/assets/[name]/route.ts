import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadBrand, loadProduct } from "@/lib/server/catalog";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

/** Serves only files the brand kit and product name; anything else is a 404. */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await params;
  const [brand, product] = await Promise.all([loadBrand(), loadProduct()]);
  const allowed = new Set([brand.logo, ...product.photos, ...(product.protectMask ? [product.protectMask] : [])]);
  const type = CONTENT_TYPES[path.extname(name)];
  if (!allowed.has(name) || !type) return new Response("Not found", { status: 404 });
  const file = path.join(process.cwd(), "assets", "tauvel", path.basename(name));
  // ?alpha=1 turns the black-and-white protect mask into alpha, so CSS can mask an overlay with it.
  if (name === product.protectMask && new URL(request.url).searchParams.get("alpha") === "1") {
    const luminance = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = luminance.info;
    const white = sharp({ create: { width, height, channels: 3, background: "#ffffff" } });
    const png = await white.joinChannel(luminance.data, { raw: { width, height, channels: 1 } }).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" } });
  }
  const body = await readFile(file);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300" } });
}
