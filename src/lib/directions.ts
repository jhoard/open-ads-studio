// Scene direction examples: a finished render per direction, for the swatches and the preview.
// Linen ritual has none yet: its test render showed a second, model-drawn wordmark above the restored one.
import type { RecipeExample } from "@/lib/recipes";

export interface DirectionExample extends RecipeExample {
  thumbUrl: string;
}

const example = (id: string, labelMatch: number, modelLabelMatch: number): DirectionExample => ({
  url: `/examples/directions/${id}.png`,
  kind: "image",
  rawUrl: `/examples/directions/${id}-raw.png`,
  glyphsUrl: `/examples/directions/${id}-glyphs.png`,
  thumbUrl: `/examples/directions/${id}-thumb.jpg`,
  labelMatch,
  modelLabelMatch,
});

export const DIRECTION_EXAMPLES: Record<string, DirectionExample> = {
  "slate-beam": example("slate-beam", 0.998, 0.49),
  "travertine-morning": example("travertine-morning", 0.999, 0.585),
  "dark-stone-evening": example("dark-stone-evening", 0.9995, 0.431),
};

export const DEFAULT_DIRECTION = "slate-beam";
