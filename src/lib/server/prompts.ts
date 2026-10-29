import type { Brand, SceneDirection } from "@/lib/types";

// Deterministic prompt templates filled from the brand kit. No language model writes these.

const paletteWords = (brand: Brand): string => brand.palette.map((color) => color.token.replace(/-/g, " ")).join(", ");

// The model renders an empty set; the real product is composited on top afterwards.
// The camera matches the straight-on packshot, and the center stays clear where the product goes.
// Any mention of a product, box or package makes the model draw one, so the prompt never names it.
export function scenePrompt(brand: Brand, direction: SceneDirection): string {
  return [
    `An empty premium still life set photographed straight on at eye level with a level, frontal camera: ${direction.surface} spans the lower third of the frame.`,
    `${direction.props} sit near the left and right edges, leaving the center of the surface completely clear and empty.`,
    `${direction.light}, shallow depth of field, editorial product photography backdrop, photorealistic.`,
    `Palette: ${paletteWords(brand)}. Mood: ${brand.tone}`,
    "No text, no lettering, no logos, no people.",
  ].join(" ");
}

export function vfxPrompt(brand: Brand, direction: SceneDirection): string {
  return [
    `A premium commercial product shot of the ${brand.name} box on ${direction.surface}.`,
    "The box stays perfectly still and in sharp focus, and its label and logo never change.",
    "A soft band of warm light slowly sweeps across the box from left to right, catching the gold foil, while fine glowing dust particles drift gently through the beam.",
    `Static locked-off camera, ${direction.light}.`,
    "Quiet ambient room tone with a soft low shimmer.",
  ].join(" ");
}
