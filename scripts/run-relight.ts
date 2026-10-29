// Still test: Qwen-Image-Edit relights the packshot in place, then only the protected glyphs are pasted back.
// Usage: npx tsx scripts/run-relight.ts [seed]
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import "../src/lib/server/config";
import { loadProduct, productPhotoPath, protectMaskPath } from "../src/lib/server/catalog";
import { alignPackshot, pasteGlyphs } from "../src/lib/server/glyph-paste";
import { outputPath } from "../src/lib/server/jobs";
import { runPass } from "../src/lib/server/recipe-run";

const DEFAULT_SEED = 7;
const RELIGHT_PROMPT =
  "Keep the product box exactly as it is: same position, same size, straight-on, same packaging and lettering. " +
  "Replace only the background and surface: the box stands on a dark slate surface, lit by a single hard beam of warm light from the left, " +
  "deep shadow on the right, a small espresso cup beside the box on the right, a soft reflection of the box on the slate under it, " +
  "and a contact shadow at its base. Relight the box to match the beam. Photographic, premium still life.";

async function main(): Promise<void> {
  const seed = process.argv[2] ? Number(process.argv[2]) : DEFAULT_SEED;
  const product = await loadProduct();
  const packshot = productPhotoPath(product);
  const mask = protectMaskPath(product);
  const dir = path.join("var", "relight", `s${seed}`);
  await mkdir(dir, { recursive: true });
  const runId = randomUUID();
  const started = Date.now();

  const qualities = ["full", "fast"] as const;
  const jobs = await Promise.all(
    qualities.map((quality) => runPass(runId, "scene-edit", `relight ${quality}`, { imagePath: packshot, aspect: "3:4", prompt: RELIGHT_PROMPT, seed, quality })),
  );
  for (const [index, job] of jobs.entries()) {
    const quality = qualities[index];
    const raw = path.join(dir, `${quality}-1-edit.png`);
    await copyFile(outputPath(job.outputFile as string), raw);
    const align = await alignPackshot(packshot, raw, mask);
    console.log(quality, "alignment", JSON.stringify(align));
    await pasteGlyphs(packshot, raw, mask, align, path.join(dir, `${quality}-2-final.png`));
  }
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s -> ${dir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
