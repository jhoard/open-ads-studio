// Run the LTX-2 reveal clip (first + last keyframe, sleeve paste) through the app's own job code.
// Usage: npx tsx scripts/run-vfx.ts <aspect> "<prompt>" [seed] [endStrength]
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import "../src/lib/server/config";
import { loadProduct, productPhotoPath } from "../src/lib/server/catalog";
import { createJob, outputPath, syncJob } from "../src/lib/server/jobs";
import { ASPECT_RATIOS, TERMINAL_STATUSES, type AspectRatio } from "../src/lib/types";

const POLL_INTERVAL_MS = 4000;
const OUT_DIR = "var/m1/vfx";
const DEFAULT_SEED = 42;

async function main(): Promise<void> {
  const [aspectArg, prompt, seedArg, strengthArg] = process.argv.slice(2);
  const endStrength = strengthArg ? Number(strengthArg) : undefined;
  const aspect = aspectArg as AspectRatio;
  if (!prompt || !ASPECT_RATIOS.includes(aspect)) {
    throw new Error(`usage: run-vfx.ts <${ASPECT_RATIOS.join("|")}> "<prompt>" [seed]`);
  }
  const product = await loadProduct();
  if (!product.reveal) throw new Error("product.json has no reveal keyframes");
  const seed = seedArg ? Number(seedArg) : DEFAULT_SEED;

  const started = Date.now();
  let job = await createJob({
    id: randomUUID(),
    stage: "vfx-reveal",
    runId: randomUUID(),
    label: "reveal",
    idempotencyKey: randomUUID(),
    params: {
      imagePath: productPhotoPath(product, product.reveal.start),
      endImagePath: productPhotoPath(product, product.reveal.end),
      pasteRect: product.reveal.sleeveRect,
      endStrength,
      aspect,
      prompt,
      seed,
    },
  });
  console.log(`submitted ${job.comfyJobId}`);
  while (!TERMINAL_STATUSES.includes(job.status)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    job = await syncJob(job);
  }
  console.log(`${job.status} in ${Math.round((Date.now() - started) / 1000)}s${job.errorType ? ` (${job.errorType}: ${job.errorMessage})` : ""}`);
  if (job.outputFile) {
    await mkdir(OUT_DIR, { recursive: true });
    const file = `${OUT_DIR}/reveal-${aspect.replace(":", "x")}-s${seed}${endStrength === undefined ? "" : `-end${endStrength}`}.mp4`;
    await copyFile(outputPath(job.outputFile), file);
    console.log(`saved ${file}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
