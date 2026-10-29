// Run a keyframed reveal (first + last keyframe, sleeve paste) through the app's own job code.
// Usage: npx tsx scripts/run-vfx.ts <vfx-reveal|hero-h3> <aspect> "<prompt>" [seed] [endStrength]
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import "../src/lib/server/config";
import { loadProduct, productPhotoPath } from "../src/lib/server/catalog";
import { createJob, outputPath, syncJob } from "../src/lib/server/jobs";
import { ASPECT_RATIOS, TERMINAL_STATUSES, type AspectRatio, type StageName } from "../src/lib/types";

const REVEAL_STAGES: StageName[] = ["vfx-reveal", "hero-h3"];
const POLL_INTERVAL_MS = 4000;
const OUT_DIR = "var/m1/vfx";
const DEFAULT_SEED = 42;

async function main(): Promise<void> {
  const [stageArg, aspectArg, prompt, seedArg, strengthArg] = process.argv.slice(2);
  const endStrength = strengthArg ? Number(strengthArg) : undefined;
  const aspect = aspectArg as AspectRatio;
  const stage = stageArg as StageName;
  if (!REVEAL_STAGES.includes(stage) || !prompt || !ASPECT_RATIOS.includes(aspect)) {
    throw new Error(`usage: run-vfx.ts <${REVEAL_STAGES.join("|")}> <${ASPECT_RATIOS.join("|")}> "<prompt>" [seed] [endStrength]`);
  }
  const product = await loadProduct();
  if (!product.reveal) throw new Error("product.json has no reveal keyframes");
  const seed = seedArg ? Number(seedArg) : DEFAULT_SEED;

  const started = Date.now();
  let job = await createJob({
    id: randomUUID(),
    stage,
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
    const prefix = stage === "hero-h3" ? "h3-reveal" : "reveal";
    const file = `${OUT_DIR}/${prefix}-${aspect.replace(":", "x")}-s${seed}${endStrength === undefined ? "" : `-end${endStrength}`}.mp4`;
    await copyFile(outputPath(job.outputFile), file);
    console.log(`saved ${file}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
