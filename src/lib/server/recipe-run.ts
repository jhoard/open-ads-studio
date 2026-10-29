import { randomUUID } from "node:crypto";
import { TERMINAL_STATUSES, type CompositeParams, type Product, type StageJob, type StageName, type StageParams } from "@/lib/types";
import { WAIT_TIMEOUT_SECONDS } from "./config";
import { productPhotoPath, protectMaskPath } from "./catalog";
import { createJob, outputPath, syncJob } from "./jobs";
import type { MotionRecipe, StillRecipe } from "./recipes";
import { analyzeSet, type SetAnalysis } from "./set-analysis";

// Chains a recipe's passes as ordinary resumable jobs, one record per pass.

const POLL_INTERVAL_MS = 4000;

export async function runPass(runId: string, stage: StageName, label: string, params: StageParams): Promise<StageJob> {
  let job = await createJob({ id: randomUUID(), stage, runId, label, idempotencyKey: randomUUID(), params });
  const deadline = Date.now() + WAIT_TIMEOUT_SECONDS * 1000;
  while (!TERMINAL_STATUSES.includes(job.status)) {
    if (Date.now() > deadline) throw new Error(`${label} is still running after ${WAIT_TIMEOUT_SECONDS}s (Comfy job ${job.comfyJobId}); resume it by ID.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    job = await syncJob(job);
  }
  if (job.status !== "succeeded" || !job.outputFile) {
    throw new Error(`${label} ${job.status}: ${job.errorType ?? "no output"}${job.errorMessage ? ` (${job.errorMessage})` : ""}`);
  }
  return job;
}

const resultPath = (job: StageJob): string => outputPath(job.outputFile as string);

function compositeParams(setPath: string, analysis: SetAnalysis, product: Product, heightShare: number): CompositeParams {
  return { setImagePath: setPath, protectMaskPath: protectMaskPath(product), heightShare, surfaceY: analysis.surfaceY, lightFrom: analysis.lightFrom };
}

export interface StillResult {
  set: StageJob;
  analysis: SetAnalysis;
  scene: StageJob;
}

export async function runStillRecipe(recipe: StillRecipe, product: Product, seed: number): Promise<StillResult> {
  const runId = randomUUID();
  const imagePath = productPhotoPath(product);
  const set = await runPass(runId, "scene-set", `${recipe.label} set`, { imagePath, aspect: recipe.aspect, prompt: recipe.setPrompt, seed });
  const analysis = await analyzeSet(resultPath(set));
  const scene = await runPass(runId, "scene-composite", recipe.label, {
    imagePath,
    aspect: recipe.aspect,
    prompt: recipe.harmonizePrompt,
    seed,
    composite: compositeParams(resultPath(set), analysis, product, recipe.heightShare),
  });
  return { set, analysis, scene };
}

export interface MotionResult {
  calmSet: StageJob;
  endSet: StageJob;
  analysis: SetAnalysis;
  start: StageJob;
  end: StageJob;
  clip: StageJob;
}

export async function runMotionRecipe(recipe: MotionRecipe, product: Product, seed: number): Promise<MotionResult> {
  const runId = randomUUID();
  const imagePath = productPhotoPath(product);
  const { aspect } = recipe;
  const calmSet = await runPass(runId, "scene-set", `${recipe.label} calm set`, { imagePath, aspect, prompt: recipe.setPrompt, seed });
  const endSet = await runPass(runId, "scene-edit", `${recipe.label} end set`, { imagePath: resultPath(calmSet), aspect, prompt: recipe.endEditPrompt, seed });

  // One analysis, applied to both keyframes, so the product lands on identical pixels in each.
  const analysis = await analyzeSet(resultPath(calmSet));
  const [start, end] = await Promise.all(
    [calmSet, endSet].map((set, index) =>
      runPass(runId, "scene-composite", `${recipe.label} ${index === 0 ? "start" : "end"} frame`, {
        imagePath,
        aspect,
        prompt: recipe.harmonizePrompt,
        seed,
        composite: compositeParams(resultPath(set), analysis, product, recipe.heightShare),
      }),
    ),
  );
  const pasteMask = end.extraFiles?.protectMask;
  if (!pasteMask) throw new Error("The end frame composite did not return its placed protect mask.");

  const clip = await runPass(runId, "vfx-reveal", recipe.label, {
    imagePath: resultPath(start),
    endImagePath: resultPath(end),
    pasteMaskPath: outputPath(pasteMask),
    aspect,
    prompt: recipe.motionPrompt,
    seed,
  });
  return { calmSet, endSet, analysis, start, end, clip };
}
