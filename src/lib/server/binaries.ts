import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

// ffmpeg and ffprobe for clip work. Locally: FFMPEG_PATH / FFPROBE_PATH or the system binaries.
// On Vercel: the static Linux builds from @ffmpeg-installer, copied to /tmp so they can be marked
// executable even when the package's postinstall chmod did not run.

const require = createRequire(import.meta.url);
const resolved = new Map<string, Promise<string>>();

async function deployable(name: "ffmpeg" | "ffprobe"): Promise<string> {
  const source = name === "ffmpeg" ? (require("@ffmpeg-installer/ffmpeg") as { path: string }).path : (require("@ffprobe-installer/ffprobe") as { path: string }).path;
  const target = path.join(os.tmpdir(), "open-ads-studio", "bin", name);
  try {
    await stat(target);
  } catch {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    await chmod(target, 0o755);
  }
  return target;
}

function binary(name: "ffmpeg" | "ffprobe"): Promise<string> {
  const override = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (override) return Promise.resolve(override);
  if (!process.env.VERCEL) return Promise.resolve(name);
  let pending = resolved.get(name);
  if (!pending) {
    pending = deployable(name);
    resolved.set(name, pending);
  }
  return pending;
}

export const ffmpegPath = (): Promise<string> => binary("ffmpeg");
export const ffprobePath = (): Promise<string> => binary("ffprobe");
