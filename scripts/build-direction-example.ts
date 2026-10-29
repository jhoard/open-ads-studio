// Bundle a finished Scene render as a direction example: final, raw, placed glyph mask, thumbnail.
// Usage: npx tsx scripts/build-direction-example.ts <direction id> <raw.png> <final.png>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import "../src/lib/server/config";
import { loadProduct, productPhotoPath, protectMaskPath } from "../src/lib/server/catalog";
import { alignPackshot, placedGlyphMask } from "../src/lib/server/glyph-paste";

const OUT_DIR = path.join("public", "examples", "directions");
const THUMB_WIDTH = 240;

async function main(): Promise<void> {
  const [id, raw, final] = process.argv.slice(2);
  if (!id || !raw || !final) throw new Error("usage: build-direction-example.ts <direction id> <raw.png> <final.png>");
  const product = await loadProduct();
  const packshot = productPhotoPath(product);
  const mask = protectMaskPath(product);
  await mkdir(OUT_DIR, { recursive: true });
  const meta = await sharp(raw).metadata();
  const align = await alignPackshot(packshot, raw, mask);
  await writeFile(path.join(OUT_DIR, `${id}-glyphs.png`), await placedGlyphMask(packshot, mask, align, { width: meta.width as number, height: meta.height as number }));
  await sharp(final).toFile(path.join(OUT_DIR, `${id}.png`));
  await sharp(raw).toFile(path.join(OUT_DIR, `${id}-raw.png`));
  await sharp(final).resize(THUMB_WIDTH).jpeg({ quality: 82 }).toFile(path.join(OUT_DIR, `${id}-thumb.jpg`));
  console.log(id, "alignment", align.score.toFixed(3));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
