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

/** Scene (relight in place): the packshot stays where it is; the model rebuilds the set and the light around it. */
export function relightPrompt(direction: SceneDirection): string {
  return (
    "Keep the product box exactly as it is: same position, same size, straight-on, same packaging and lettering. " +
    `Replace only the background and surface: the box stands on ${direction.surface}, lit by ${direction.light}, ` +
    `${direction.props}, a soft reflection of the box on the surface under it, and a contact shadow at its base. ` +
    "Relight the box to match. Photographic, premium still life."
  );
}

export const REVEAL_PROMPT =
  "The chocolate bar slowly rises out of the green sleeve, the gold foil unfolds and crinkles open, revealing glossy squares with an embossed T monogram. " +
  "Bright, even, white studio light throughout. Locked-off camera, nothing else in the scene moves.";
export const REVEAL_SOUND = " Sound: soft foil crinkle, quiet studio room tone.";

/** Cinemagraph: the finished Scene still is both keyframes; only the ambient elements move. */
export const CINEMAGRAPH_PROMPT =
  "The chocolate box stays perfectly still. Steam slowly curls up from the espresso cup, the light beam drifts gently across the dark wall, " +
  "faint dust motes turn in the beam. Locked-off camera. Sound: quiet room tone, a faint cup clink.";
export const CINEMAGRAPH_SECONDS = 5;
