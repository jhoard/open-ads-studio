import { randomUUID } from "node:crypto";
import type { RecipeId } from "@/lib/recipes";
import type { Brand, Product, StageJob } from "@/lib/types";
import { productPhotoPath, protectMaskPath } from "./catalog";
import { createJob } from "./jobs";
import { REVEAL_PROMPT, REVEAL_SOUND, relightPrompt } from "./prompts";

// Maps a Create-step recipe to the job that renders it.

const REVEAL_ASPECT = "3:4";
const DEFAULT_SEEDS: Record<RecipeId, number> = { scene: 7, "reveal-draft": 42, "reveal-final": 42 };

export interface RecipeRequest {
  recipe: RecipeId;
  directionId?: string;
  seed?: number;
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
