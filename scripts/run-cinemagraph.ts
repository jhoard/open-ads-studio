// Cinemagraph: one finished Scene still as both H3 keyframes, ambient motion and audio, glyphs pasted on every frame.
// Usage: npx tsx scripts/run-cinemagraph.ts <scene.png> [seed]
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import "../src/lib/server/config";
import { loadProduct, productPhotoPath, protectMaskPath } from "../src/lib/server/catalog";
import { alignToClip, pasteClip } from "../src/lib/server/clip-paste";
import { HERO_SIZE } from "../src/lib/server/geometry";
import { alignPackshot } from "../src/lib/server/glyph-paste";
import { outputPath } from "../src/lib/server/jobs";
import { DEFAULT_POST_VFX, postVfx } from "../src/lib/server/post-vfx";
import { runPass } from "../src/lib/server/recipe-run";

const DEFAULT_SEED = 42;
const ASPECT = "3:4";
const DURATION_SECONDS = 5;
const PROMPT =
  "The chocolate box stays perfectly still. Steam slowly curls up from the espresso cup, the light beam drifts gently across the dark wall, " +
  "faint dust motes turn in the beam. Locked-off camera. Sound: quiet room tone, a faint cup clink.";

async function main(): Promise<void> {
  const [still, seedArg] = process.argv.slice(2);
  if (!still) throw new Error("usage: run-cinemagraph.ts <scene.png> [seed]");
  const seed = seedArg ? Number(seedArg) : DEFAULT_SEED;
  const product = await loadProduct();
  const dir = path.join("var", "cinemagraph", `s${seed}`);
  await mkdir(dir, { recursive: true });
  const started = Date.now();

  // H3 runs while the overlay is built. Its own rect paste stays off; the glyph overlay replaces it.
  const clipJob = runPass(randomUUID(), "hero-h3", "cinemagraph", { imagePath: still, endImagePath: still, aspect: ASPECT, prompt: PROMPT, seed, durationSeconds: DURATION_SECONDS });

  const packshot = productPhotoPath(product);
  const mask = protectMaskPath(product);
  const align = await alignPackshot(packshot, still, mask);
  console.log("alignment", JSON.stringify(align));
  const meta = await sharp(still).metadata();
  // Same cover-scale and center crop as the workflow's resize node.
  const clipAlign = alignToClip(align, { width: meta.width as number, height: meta.height as number }, HERO_SIZE[ASPECT]);

  const clip = await clipJob;
  const raw = outputPath(clip.outputFile as string);
  console.log(`raw ${raw}`);
  const pasted = path.join(dir, "1-pasted.mp4");
  const scores = await pasteClip(raw, pasted, packshot, mask, clipAlign, path.join(dir, "work"));
  console.log(`label match per frame: min ${Math.min(...scores).toFixed(4)}, mean ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4)}`);
  const final = path.join(dir, "2-final.mp4");
  await postVfx(pasted, final, DEFAULT_POST_VFX);
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s -> ${final}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
