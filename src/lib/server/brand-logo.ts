import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Brand } from "@/lib/types";
import { validateSiteUrl } from "./public-url";

const MAX_BYTES = 1024 * 1024;

/** Redirects are validated independently and connections are pinned to the vetted public address. */
async function publicImage(raw: string, redirects = 0): Promise<Buffer> {
  const { url, address } = await validateSiteUrl(raw);
  if (url.username || url.password) throw new Error("Logo URLs cannot contain credentials.");
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      family: address.includes(":") ? 6 : 4,
      lookup: (_host, _options, callback) => callback(null, address, address.includes(":") ? 6 : 4),
      headers: { Accept: "image/*", "User-Agent": "OpenAdsStudio/1.0" },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.resume();
        if (!response.headers.location || redirects >= 3) { reject(new Error("Too many logo redirects.")); return; }
        publicImage(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200 || !response.headers["content-type"]?.startsWith("image/")) {
        response.resume(); reject(new Error("Logo is not an image.")); return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) response.destroy(new Error("Logo exceeds 1 MB."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    const timer = setTimeout(() => request.destroy(new Error("Logo request timed out.")), 5000);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end();
  });
}

/** Remote SVGs are rasterized before inclusion. Missing or blocked marks fall back to the brand name. */
export async function loadBrandLogo(brand: Brand): Promise<Buffer | null> {
  try {
    const bytes = brand.id === "tauvel" && brand.logo === "logo.svg"
      ? Buffer.from((await readFile(path.join(process.cwd(), "assets", "tauvel", "logo.svg"), "utf8")).replace(/currentColor/g, "#B8925A"))
      : /^https?:\/\//.test(brand.logo) ? await publicImage(brand.logo) : null;
    return bytes ? await sharp(bytes, { limitInputPixels: 16_000_000 }).resize(1000, 600, { fit: "inside", withoutEnlargement: true }).png().toBuffer() : null;
  } catch { return null; }
}
