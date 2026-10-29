// Run an art-directed recipe end to end and copy every pass's output to var/recipes/<id>/.
// Usage: npx tsx scripts/run-recipe.ts <recipe id> [seed]
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import "../src/lib/server/config";
import { loadProduct } from "../src/lib/server/catalog";
import { outputPath } from "../src/lib/server/jobs";
import { runMotionRecipe, runStillRecipe } from "../src/lib/server/recipe-run";
import { RECIPES } from "../src/lib/server/recipes";
import type { StageJob } from "../src/lib/types";

const DEFAULT_SEED = 7;

async function keep(dir: string, name: string, job: StageJob): Promise<void> {
  if (!job.outputFile) return;
  await copyFile(outputPath(job.outputFile), path.join(dir, `${name}${path.extname(job.outputFile)}`));
}

async function main(): Promise<void> {
  const [id, seedArg] = process.argv.slice(2);
  const recipe = id ? RECIPES[id] : undefined;
  if (!recipe) throw new Error(`usage: run-recipe.ts <${Object.keys(RECIPES).join("|")}> [seed]`);
  const seed = seedArg ? Number(seedArg) : DEFAULT_SEED;
  const product = await loadProduct();
  const dir = path.join("var", "recipes", `${recipe.id}-s${seed}`);
  await mkdir(dir, { recursive: true });
  const started = Date.now();

  if (recipe.kind === "still") {
    const result = await runStillRecipe(recipe, product, seed);
    await keep(dir, "1-set", result.set);
    await keep(dir, "2-scene", result.scene);
    console.log("analysis", JSON.stringify(result.analysis));
  } else {
    const result = await runMotionRecipe(recipe, product, seed);
    await keep(dir, "1-calm-set", result.calmSet);
    await keep(dir, "2-end-set", result.endSet);
    await keep(dir, "3-start-frame", result.start);
    await keep(dir, "4-end-frame", result.end);
    await keep(dir, "5-clip", result.clip);
    console.log("analysis", JSON.stringify(result.analysis));
  }
  console.log(`${recipe.label} done in ${Math.round((Date.now() - started) / 1000)}s -> ${dir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
