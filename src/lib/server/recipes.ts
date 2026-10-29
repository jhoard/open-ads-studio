import type { AspectRatio } from "@/lib/types";

// Art-directed shot recipes. Set prompts never name the product: any mention of a box or package
// makes the model draw one. The product is composited afterwards, its label protected throughout.
// Effects stay behind or below the pack; nothing may cover the protected label region.

interface RecipeBase {
  id: string;
  label: string;
  aspect: AspectRatio;
  /** Product height as a share of frame height. */
  heightShare: number;
  setPrompt: string;
  harmonizePrompt: string;
}

export interface StillRecipe extends RecipeBase {
  kind: "still";
}

export interface MotionRecipe extends RecipeBase {
  kind: "motion";
  /** Applied to the calm set to make the end keyframe's set, so backdrop and camera match. */
  endEditPrompt: string;
  /** Action only, in bright clear terms (cfg 1 ignores negatives). */
  motionPrompt: string;
}

export type Recipe = StillRecipe | MotionRecipe;

const HARMONIZE =
  "Relight the product so its lighting, reflections and shadows match the surrounding scene: the same light direction, color and contrast. Keep the composition, the product's shape and position, and all printed text and logos exactly the same. Do not add anything.";

export const RECIPES: Record<string, Recipe> = {
  topography: {
    id: "topography",
    label: "Topography",
    kind: "still",
    aspect: "16:9",
    heightShare: 0.5,
    setPrompt: [
      "Cinematic wide landscape photograph from a level, eye-height camera.",
      "A vast canyon carved from dark chocolate stretches into the distance, its walls built from layered strata that follow flowing topographic contour lines, soft mist pooling in the valleys.",
      "A dramatic low sun on the left horizon rakes golden light across the ridges. A tiny human silhouette stands on a far ledge for scale.",
      "In the foreground a flat, level rim of smooth dark chocolate rock runs across the bottom fifth of the frame, its center bare and empty.",
      "A light warm-stone sky with soft haze. Photorealistic, epic scale, premium. No text, no lettering, no logos.",
    ].join(" "),
    harmonizePrompt: HARMONIZE,
  },
  molten: {
    id: "molten",
    label: "Molten",
    kind: "motion",
    aspect: "9:16",
    heightShare: 0.45,
    setPrompt: [
      "Premium studio still life photograph from a level, eye-height camera.",
      "A dark, near-black backdrop with a soft gold edge glow and a hard rim light from behind.",
      "In the foreground a perfectly calm, glossy pool of liquid dark chocolate and espresso spans the bottom fifth of the frame, still and mirror-smooth, its center bare.",
      "Photorealistic, high contrast, luxurious. No text, no lettering, no logos, no people.",
    ].join(" "),
    endEditPrompt: [
      "Add a slow-motion wave of liquid dark chocolate and espresso cresting high behind the center of the frame, rising well above and to both sides of the center, and breaking into glossy frozen splashes across the pool, droplets suspended in the air, the hard rim light catching every glossy edge.",
      "Keep the backdrop, the gold edge glow, the lighting and the camera exactly the same. No text, no logos.",
    ].join(" "),
    motionPrompt:
      "A slow-motion wave of liquid dark chocolate and espresso rises behind the pack and breaks around its base in glossy splashes, then hangs frozen in the air. Hard rim light, dark backdrop with a gold edge glow. Locked-off camera, the pack stays perfectly still.",
    harmonizePrompt: HARMONIZE,
  },
};
