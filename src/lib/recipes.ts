// The recipe catalog the Create step shows. Client-safe: no server paths.

export type RecipeId = "scene" | "reveal-draft" | "reveal-final";

export interface RecipeExample {
  url: string;
  kind: "image" | "video";
  /** Before the glyph paste, for the side-by-side. */
  rawUrl?: string;
  labelMatch?: number;
  modelLabelMatch?: number;
}

export interface RecipeInfo {
  id: RecipeId;
  label: string;
  kind: "still" | "video";
  summary: string;
  models: string[];
  workflows: string[];
  /** Needs the product's reveal keyframes (closed and opened shots). */
  needsReveal: boolean;
  example: RecipeExample;
}

export const RECIPES: readonly RecipeInfo[] = [
  {
    id: "scene",
    label: "Scene",
    kind: "still",
    summary: "Your packshot relit in place on a brand set. The label is found and restored pixel for pixel, tone-matched to the light.",
    models: ["Qwen-Image-Edit 2509"],
    workflows: ["scene-edit.json"],
    needsReveal: false,
    example: { url: "/examples/scene-slate.png", kind: "image", rawUrl: "/examples/scene-slate-raw.png", labelMatch: 0.998, modelLabelMatch: 0.49 },
  },
  {
    id: "reveal-draft",
    label: "Reveal: Draft",
    kind: "video",
    summary: "The bar rises out of the sleeve, keyframed from your closed and open shots. Fast preview, no audio.",
    models: ["LTX-2 19B distilled"],
    workflows: ["vfx-ltx-reveal.json"],
    needsReveal: true,
    example: { url: "/examples/reveal-draft.mp4", kind: "video" },
  },
  {
    id: "reveal-final",
    label: "Reveal: Final",
    kind: "video",
    summary: "The same keyframed reveal with native audio: foil crinkle and room tone.",
    models: ["MiniMax H3"],
    workflows: ["hero-h3.json"],
    needsReveal: true,
    example: { url: "/examples/reveal-final.mp4", kind: "video" },
  },
];

export const findRecipe = (id: string): RecipeInfo | undefined => RECIPES.find((recipe) => recipe.id === id);
