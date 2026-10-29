import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Deterministic post on a generated clip: hold the first and last frames, then an eased push-in.
// No generative model is involved; this is plain ffmpeg.

const run = promisify(execFile);
const ffmpeg = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";
const ffprobe = (): string => process.env.FFPROBE_PATH ?? "ffprobe";

// Zoom is rendered at 2x then downscaled, so each frame's zoom step lands on a quarter pixel instead of stuttering.
const SUPERSAMPLE = 2;
const VIDEO_CRF = 16;

export interface PostVfxOptions {
  holdStartSeconds: number;
  holdEndSeconds: number;
  /** Final scale at the last frame, e.g. 1.08 for a 100% to 108% push-in. */
  endZoom: number;
}

export const DEFAULT_POST_VFX: PostVfxOptions = { holdStartSeconds: 0.6, holdEndSeconds: 0.8, endZoom: 1.08 };

interface ClipInfo {
  width: number;
  height: number;
  fps: number;
  frames: number;
  hasAudio: boolean;
}

async function probe(input: string): Promise<ClipInfo> {
  const { stdout } = await run(ffprobe(), ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames", "-of", "json", input]);
  const streams = (JSON.parse(stdout) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }[] }).streams;
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height || !video.r_frame_rate || !video.nb_frames) throw new Error(`No video stream in ${input}`);
  const [num, den] = video.r_frame_rate.split("/").map(Number);
  return { width: video.width, height: video.height, fps: num / (den || 1), frames: Number(video.nb_frames), hasAudio: streams.some((s) => s.codec_type === "audio") };
}

export function postVfxFilter(info: ClipInfo, options: PostVfxOptions): string {
  const holdStartFrames = Math.round(options.holdStartSeconds * info.fps);
  const holdEndFrames = Math.round(options.holdEndSeconds * info.fps);
  const lastFrame = info.frames + holdStartFrames + holdEndFrames - 1;
  const w = info.width * SUPERSAMPLE;
  const h = info.height * SUPERSAMPLE;
  // Smoothstep ease from 1 to endZoom over the padded clip; n is the output frame index.
  const progress = `(n/${lastFrame})`;
  const zoom = `(1+${options.endZoom - 1}*${progress}*${progress}*(3-2*${progress}))`;
  return [
    `tpad=start=${holdStartFrames}:start_mode=clone:stop=${holdEndFrames}:stop_mode=clone`,
    `scale=${w}:${h}:flags=lanczos`,
    `scale=w='2*trunc(${w}*${zoom}/2)':h='2*trunc(${h}*${zoom}/2)':eval=frame:flags=lanczos`,
    `crop=${w}:${h}:(in_w-${w})/2:(in_h-${h})/2`,
    `scale=${info.width}:${info.height}:flags=lanczos`,
    "format=yuv420p",
  ].join(",");
}

export async function postVfx(input: string, output: string, options: PostVfxOptions = DEFAULT_POST_VFX): Promise<void> {
  const info = await probe(input);
  const args = ["-v", "error", "-y", "-i", input, "-vf", postVfxFilter(info, options), "-r", String(info.fps), "-c:v", "libx264", "-crf", String(VIDEO_CRF), "-preset", "slow"];
  if (info.hasAudio) {
    // Keep sound in sync with the delayed picture, padded with silence through the end hold.
    const delayMs = Math.round(options.holdStartSeconds * 1000);
    args.push("-af", `adelay=${delayMs}:all=1,apad`, "-shortest", "-c:a", "aac", "-b:a", "192k");
  }
  args.push("-movflags", "+faststart", output);
  await run(ffmpeg(), args);
}
