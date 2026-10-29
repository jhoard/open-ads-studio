import { execFile } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pasteGlyphs, type Alignment } from "./glyph-paste";

// Glyph paste on every frame of a clip, each frame tone-matched on its own so a moving light carries
// across the label. The box must hold still in the clip (keyframed from one still).

const run = promisify(execFile);
const FRAME_CONCURRENCY = 6;
// In a clip keyframed from a finished still, the model redraws the text where the still had it, so no
// guard band is needed; pasting packshot face around the glyphs would show as a halo when the light moves.
const CLIP_PASTE = { pasteBand: 0 };

/** Map a packshot-to-still alignment through the clip's cover-scale and center crop. */
export function alignToClip(align: Alignment, still: { width: number; height: number }, clip: { width: number; height: number }): Alignment {
  const scale = Math.max(clip.width / still.width, clip.height / still.height);
  const cropX = (still.width * scale - clip.width) / 2;
  const cropY = (still.height * scale - clip.height) / 2;
  return { ...align, scaleX: align.scaleX * scale, scaleY: align.scaleY * scale, dx: Math.round(align.dx * scale - cropX), dy: Math.round(align.dy * scale - cropY) };
}

export async function pasteClip(input: string, output: string, packshotPath: string, maskPath: string, align: Alignment, workDir: string): Promise<number[]> {
  const frames = path.join(workDir, "frames");
  const pasted = path.join(workDir, "pasted");
  await rm(workDir, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  await mkdir(pasted, { recursive: true });
  const probe = await run("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", input]);
  const rate = probe.stdout.trim();
  await run("ffmpeg", ["-loglevel", "error", "-i", input, path.join(frames, "%04d.png")]);

  const names = (await readdir(frames)).filter((name) => name.endsWith(".png")).sort();
  const scores: number[] = new Array(names.length);
  for (let start = 0; start < names.length; start += FRAME_CONCURRENCY) {
    await Promise.all(
      names.slice(start, start + FRAME_CONCURRENCY).map(async (name, offset) => {
        const result = await pasteGlyphs(packshotPath, path.join(frames, name), maskPath, align, path.join(pasted, name), CLIP_PASTE);
        scores[start + offset] = result.labelMatch;
      }),
    );
  }
  await run("ffmpeg", ["-loglevel", "error", "-y", "-framerate", rate, "-i", path.join(pasted, "%04d.png"), "-i", input, "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", output]);
  return scores;
}
