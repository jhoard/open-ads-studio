// Post a generated VFX clip: hold first and last frames, eased push-in. Deterministic ffmpeg, no generation.
// Usage: npx tsx scripts/post-vfx.ts <input.mp4> <output.mp4> [holdStart=0.6] [holdEnd=0.8] [endZoom=1.08]
import { DEFAULT_POST_VFX, postVfx } from "../src/lib/server/post-vfx";

async function main(): Promise<void> {
  const [input, output, holdStart, holdEnd, endZoom] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: post-vfx.ts <input.mp4> <output.mp4> [holdStart] [holdEnd] [endZoom]");
  const options = {
    holdStartSeconds: holdStart ? Number(holdStart) : DEFAULT_POST_VFX.holdStartSeconds,
    holdEndSeconds: holdEnd ? Number(holdEnd) : DEFAULT_POST_VFX.holdEndSeconds,
    endZoom: endZoom ? Number(endZoom) : DEFAULT_POST_VFX.endZoom,
  };
  if (Object.values(options).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("hold and zoom values must be non-negative numbers");
  await postVfx(input, output, options);
  console.log(`wrote ${output} (hold ${options.holdStartSeconds}s / ${options.holdEndSeconds}s, push-in to ${Math.round(options.endZoom * 100)}%)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
