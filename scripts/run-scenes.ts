// Run one scene variant per brand scene direction through the app's own job code, in parallel.
// Usage: npx tsx scripts/run-scenes.ts [aspect] [fast|full]
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import "../src/lib/server/config";
import { loadBrand, loadProduct, productPhotoPath } from "../src/lib/server/catalog";
import { createJob, outputPath, syncJob } from "../src/lib/server/jobs";
import { scenePrompt } from "../src/lib/server/prompts";
import { ASPECT_RATIOS, TERMINAL_STATUSES, type AspectRatio, type StageJob } from "../src/lib/types";

const POLL_INTERVAL_MS = 4000;
const OUT_DIR = "var/m1/scenes";

async function waitFor(job: StageJob): Promise<StageJob> {
  let current = job;
  while (!TERMINAL_STATUSES.includes(current.status)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    current = await syncJob(current);
  }
  return current;
}

async function main(): Promise<void> {
  const aspect = (process.argv[2] ?? "9:16") as AspectRatio;
  if (!ASPECT_RATIOS.includes(aspect)) throw new Error(`aspect must be one of ${ASPECT_RATIOS.join(", ")}`);
  const quality = process.argv[3] === "full" ? "full" : "fast";
  const [brand, product] = await Promise.all([loadBrand(), loadProduct()]);
  const imagePath = productPhotoPath(product);
  const runId = randomUUID();
  await mkdir(OUT_DIR, { recursive: true });

  const started = Date.now();
  const jobs = await Promise.all(
    brand.sceneDirections.map((direction, index) =>
      createJob({
        id: randomUUID(),
        stage: "scene",
        runId,
        label: direction.label,
        idempotencyKey: randomUUID(),
        params: { imagePath, aspect, prompt: scenePrompt(brand, direction), seed: 1000 + index, quality },
      }),
    ),
  );
  console.log(`run ${runId}: submitted ${jobs.length} scene jobs`);

  const finished = await Promise.all(jobs.map(waitFor));
  for (const job of finished) {
    const line = `${job.label}: ${job.status}${job.errorType ? ` (${job.errorType}: ${job.errorMessage})` : ""}`;
    console.log(line);
    if (job.outputFile) await copyFile(outputPath(job.outputFile), `${OUT_DIR}/${job.label.replace(/\W+/g, "-").toLowerCase()}-${quality}.png`);
  }
  console.log(`total ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
