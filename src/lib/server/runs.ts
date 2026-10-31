import { randomUUID } from "node:crypto";
import type { RecipeId } from "@/lib/recipes";
import type { AlignMode, Brand, FileRef, Product, Rect, StageJob } from "@/lib/types";
import { productPhotoPath, protectMaskPath } from "./catalog";
import { createJob, findJob, outputRef, resolveRef } from "./jobs";
import { productRef, type UploadedProduct } from "./products";
import { CINEMAGRAPH_PROMPT, CINEMAGRAPH_SECONDS, REVEAL_PROMPT, REVEAL_SOUND, relightPrompt } from "./prompts";

// Maps a Create-step recipe to the job that renders it.

const REVEAL_ASPECT = "3:4";
// Cinemagraph seed 7: seed 42 relit the box and threw a two-frame spark.
const DEFAULT_SEEDS: Record<RecipeId, number> = { scene: 7, "reveal-draft": 42, "reveal-final": 42, cinemagraph: 7 };
const CINEMAGRAPH_ASPECT = "3:4";
// Tauvel runs both placements, its color-based box and the generic silhouette fit, and keeps whichever
// restores the label better; both scores stay on the job record.
export const TAUVEL_ALIGN: AlignMode = "best";
/** Where Tauvel's packshot cutout is cached once BiRefNet has made it. */
export const TAUVEL_PACKSHOT_CUTOUT = "store:catalog/tauvel/packshot-cutout.png";

/** What a recipe needs from a product, wherever its files live. */
export interface ProductSource {
  id: string;
  kind: "catalog" | "upload";
  packshot: FileRef;
  mask: FileRef;
  cutout?: FileRef;
  reveal?: { start: FileRef; end: FileRef; sleeveRect: Rect };
}

export function catalogSource(product: Product): ProductSource {
  return {
    id: product.id,
    kind: "catalog",
    packshot: productPhotoPath(product),
    mask: protectMaskPath(product),
    ...(product.reveal ? { reveal: { start: productPhotoPath(product, product.reveal.start), end: productPhotoPath(product, product.reveal.end), sleeveRect: product.reveal.sleeveRect } } : {}),
  };
}

export function uploadSource(upload: UploadedProduct): ProductSource {
  return { id: upload.id, kind: "upload", packshot: productRef(upload.id, "packshot.png"), mask: productRef(upload.id, "mask.png"), cutout: productRef(upload.id, "cutout.png") };
}

export interface RecipeRequest {
  recipe: RecipeId;
  directionId?: string;
  seed?: number;
  /** Cinemagraph: the finished Scene creative to animate. */
  sourceCreativeId?: string;
  idempotencyKey: string;
}

export class RecipeInputError extends Error {}

/** The Scene a Cinemagraph animates: finished, and made by this visitor. */
export async function sourceScene(id: string | undefined, visitor: string): Promise<StageJob> {
  const source = id ? await findJob(id) : null;
  if (!source || source.stage !== "scene-relight" || source.status !== "succeeded" || !source.outputFile || !source.glyphPaste || (source.visitor && source.visitor !== visitor)) {
    throw new RecipeInputError("A cinemagraph animates a finished Scene. Create a Scene first.");
  }
  return source;
}

export async function startRecipe(brand: Brand, product: ProductSource, request: RecipeRequest, visitor: string): Promise<StageJob> {
  const seed = request.seed ?? DEFAULT_SEEDS[request.recipe];
  const base = { id: randomUUID(), runId: randomUUID(), idempotencyKey: request.idempotencyKey, visitor };

  if (request.recipe === "scene") {
    const direction = brand.sceneDirections.find((candidate) => candidate.id === request.directionId) ?? brand.sceneDirections[0];
    if (!direction) throw new RecipeInputError("The brand kit has no scene directions.");
    const align: AlignMode = product.kind === "upload" ? "silhouette" : TAUVEL_ALIGN;
    const packshotCutout = product.cutout ?? (align === "best" ? TAUVEL_PACKSHOT_CUTOUT : undefined);
    return createJob({
      ...base,
      stage: "scene-relight",
      label: `Scene: ${direction.label}`,
      // Scene keeps the packshot's own framing; export sizes come later. The aspect is recorded only.
      params: { imagePath: await resolveRef(product.packshot), aspect: "3:4", prompt: relightPrompt(direction), seed, quality: "fast" },
      glyphPaste: { packshotPath: product.packshot, protectMaskPath: product.mask, align, ...(packshotCutout ? { packshotCutout } : {}) },
    });
  }

  if (request.recipe === "cinemagraph") {
    const source = await sourceScene(request.sourceCreativeId, visitor);
    const paste = source.glyphPaste as NonNullable<StageJob["glyphPaste"]>;
    const still = outputRef(source.outputFile as string);
    const stillPath = await resolveRef(still);
    return createJob({
      ...base,
      stage: "hero-h3",
      label: "Cinemagraph",
      params: { imagePath: stillPath, endImagePath: stillPath, aspect: CINEMAGRAPH_ASPECT, prompt: CINEMAGRAPH_PROMPT, seed, durationSeconds: CINEMAGRAPH_SECONDS },
      clipPaste: {
        stillPath: still,
        packshotPath: paste.packshotPath,
        protectMaskPath: paste.protectMaskPath,
        ...(source.alignment ? { alignment: source.alignment } : {}),
        reflection: paste.align !== "silhouette",
      },
    });
  }

  const reveal = product.reveal;
  if (!reveal) throw new RecipeInputError("Reveal needs a closed and an open shot of the product. It is available for Tauvel only.");
  const final = request.recipe === "reveal-final";
  return createJob({
    ...base,
    stage: final ? "hero-h3" : "vfx-reveal",
    label: final ? "Reveal: Final" : "Reveal: Draft",
    params: {
      imagePath: await resolveRef(reveal.start),
      endImagePath: await resolveRef(reveal.end),
      pasteRect: reveal.sleeveRect,
      aspect: REVEAL_ASPECT,
      prompt: final ? REVEAL_PROMPT + REVEAL_SOUND : REVEAL_PROMPT,
      seed,
    },
  });
}
