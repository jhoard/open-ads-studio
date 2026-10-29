// The recipe catalog the Create step shows. Client-safe: no server paths.
import type { StageName } from "@/lib/types";

export type RecipeId = "scene" | "reveal-draft" | "reveal-final" | "cinemagraph";

export interface RecipeExample {
  url: string;
  kind: "image" | "video";
  /** Most representative frame, shown until the card is hovered. */
  posterUrl?: string;
  /** Before the glyph paste, for the side-by-side. */
  rawUrl?: string;
  /** Placed glyph mask, for the Review highlight. */
  glyphsUrl?: string;
  labelMatch?: number;
  modelLabelMatch?: number;
}

/** What a recipe needs from earlier steps before it can run live. */
export type RecipeNeed = "reveal-keyframes" | "scene-still";

/** One runnable recipe: one job, one workflow chain. */
export interface RecipeInfo {
  id: RecipeId;
  label: string;
  kind: "still" | "video";
  stage: StageName;
  summary: string;
  models: string[];
  workflows: string[];
  needs: RecipeNeed | null;
  example: RecipeExample;
}

export const RECIPES: readonly RecipeInfo[] = [
  {
    id: "scene",
    label: "Scene",
    kind: "still",
    stage: "scene-relight",
    summary: "Your packshot relit in place on a brand set. The label is found and restored pixel for pixel, tone-matched to the light.",
    models: ["Qwen-Image-Edit 2509"],
    workflows: ["scene-edit.json"],
    needs: null,
    example: {
      url: "/examples/directions/slate-beam.png",
      kind: "image",
      rawUrl: "/examples/directions/slate-beam-raw.png",
      glyphsUrl: "/examples/directions/slate-beam-glyphs.png",
      labelMatch: 0.998,
      modelLabelMatch: 0.49,
    },
  },
  {
    id: "reveal-draft",
    label: "Reveal: Draft",
    kind: "video",
    stage: "vfx-reveal",
    summary: "The bar rises out of the sleeve, keyframed from your closed and open shots. Fast preview, no audio.",
    models: ["LTX-2"],
    workflows: ["vfx-ltx-reveal.json"],
    needs: "reveal-keyframes",
    example: { url: "/examples/reveal-draft.mp4", kind: "video", posterUrl: "/examples/reveal-draft-poster.jpg" },
  },
  {
    id: "reveal-final",
    label: "Reveal: Final",
    kind: "video",
    stage: "hero-h3",
    summary: "The same keyframed reveal with native audio: foil crinkle and room tone.",
    models: ["MiniMax H3"],
    workflows: ["hero-h3.json"],
    needs: "reveal-keyframes",
    example: { url: "/examples/reveal-final.mp4", kind: "video", posterUrl: "/examples/reveal-final-poster.jpg" },
  },
  {
    id: "cinemagraph",
    label: "Cinemagraph",
    kind: "video",
    stage: "hero-h3",
    summary: "A finished Scene comes alive: steam curls from the cup, the beam drifts, quiet room tone. The label is restored on every frame.",
    models: ["MiniMax H3"],
    workflows: ["hero-h3.json"],
    needs: "scene-still",
    example: { url: "/examples/cinemagraph.mp4", kind: "video", posterUrl: "/examples/cinemagraph-poster.jpg" },
  },
];

export const findRecipe = (id: string): RecipeInfo | undefined => RECIPES.find((recipe) => recipe.id === id);

/** A card on the Create step: one recipe, or several variants behind a segmented toggle. */
export interface RecipeCard {
  id: string;
  label: string;
  summary: string;
  variants: { recipe: RecipeId; label: string }[];
}

export const RECIPE_CARDS: readonly RecipeCard[] = [
  { id: "scene", label: "Scene", summary: RECIPES[0].summary, variants: [{ recipe: "scene", label: "Scene" }] },
  {
    id: "reveal",
    label: "Reveal",
    summary: "The bar rises out of the sleeve, keyframed from your closed and open shots. Draft previews fast; Final adds native audio.",
    variants: [
      { recipe: "reveal-draft", label: "Draft" },
      { recipe: "reveal-final", label: "Final" },
    ],
  },
  { id: "cinemagraph", label: "Cinemagraph", summary: RECIPES[3].summary, variants: [{ recipe: "cinemagraph", label: "Cinemagraph" }] },
];

export const NEED_REASON: Record<RecipeNeed, string> = {
  "reveal-keyframes": "Needs: open shot",
  "scene-still": "Needs: a finished Scene",
};
