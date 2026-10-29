import { randomUUID } from "node:crypto";
import type { RecipeId } from "@/lib/recipes";
import type { Brand, Product, StageJob } from "@/lib/types";
import { productPhotoPath, protectMaskPath } from "./catalog";
import { createJob, findJob, outputPath } from "./jobs";
import { CINEMAGRAPH_PROMPT, CINEMAGRAPH_SECONDS, REVEAL_PROMPT, REVEAL_SOUND, relightPrompt } from "./prompts";

// Maps a Create-step recipe to the job that renders it.

const REVEAL_ASPECT = "3:4";
// Cinemagraph seed 7: seed 42 relit the box and threw a two-frame spark.
const DEFAULT_SEEDS: Record<RecipeId, number> = { scene: 7, "reveal-draft": 42, "reveal-final": 42, cinemagraph: 7 };
const CINEMAGRAPH_ASPECT = "3:4";

export interface RecipeRequest {
  recipe: RecipeId;
  directionId?: string;
  seed?: number;
  /** Cinemagraph: the finished Scene creative to animate. */
  sourceCreativeId?: string;
  idempotencyKey: string;
}

export class RecipeInputError extends Error {}

export async function startRecipe(brand: Brand, product: Product, request: RecipeRequest): Promise<StageJob> {
  const seed = request.seed ?? DEFAULT_SEEDS[request.recipe];
  const base = { id: randomUUID(), runId: randomUUID(), idempotencyKey: request.idempotencyKey };

  if (request.recipe === "scene") {
    const direction = brand.sceneDirections.find((candidate) => candidate.id === request.directionId) ?? brand.sceneDirections[0];
    if (!direction) throw new RecipeInputError("The brand kit has no scene directions.");
    const packshotPath = productPhotoPath(product);
    return createJob({
      ...base,
      stage: "scene-relight",
      label: `Scene: ${direction.label}`,
      // Scene keeps the packshot's own framing; export sizes come later. The aspect is recorded only.
      params: { imagePath: packshotPath, aspect: "3:4", prompt: relightPrompt(direction), seed, quality: "fast" },
      glyphPaste: { packshotPath, protectMaskPath: protectMaskPath(product) },
    });
  }

  if (request.recipe === "cinemagraph") {
    const source = request.sourceCreativeId ? await findJob(request.sourceCreativeId) : null;
    if (!source || source.stage !== "scene-relight" || source.status !== "succeeded" || !source.outputFile) {
      throw new RecipeInputError("A cinemagraph animates a finished Scene. Create a Scene first.");
    }
    const stillPath = outputPath(source.outputFile);
    return createJob({
      ...base,
      stage: "hero-h3",
      label: "Cinemagraph",
      params: { imagePath: stillPath, endImagePath: stillPath, aspect: CINEMAGRAPH_ASPECT, prompt: CINEMAGRAPH_PROMPT, seed, durationSeconds: CINEMAGRAPH_SECONDS },
      clipPaste: { stillPath, packshotPath: productPhotoPath(product), protectMaskPath: protectMaskPath(product) },
    });
  }

  const reveal = product.reveal;
  if (!reveal) throw new RecipeInputError("This product has no reveal keyframes. Add a closed and an open shot first.");
  const final = request.recipe === "reveal-final";
  return createJob({
    ...base,
    stage: final ? "hero-h3" : "vfx-reveal",
    label: final ? "Reveal: Final" : "Reveal: Draft",
    params: {
      imagePath: productPhotoPath(product, reveal.start),
      endImagePath: productPhotoPath(product, reveal.end),
      pasteRect: reveal.sleeveRect,
      aspect: REVEAL_ASPECT,
      prompt: final ? REVEAL_PROMPT + REVEAL_SOUND : REVEAL_PROMPT,
      seed,
    },
  });
}
