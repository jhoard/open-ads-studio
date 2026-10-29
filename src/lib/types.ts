/** vfx-ltx: single image to clip (M0 page). vfx-reveal: first + last keyframe reveal with sleeve paste. */
export type StageName = "scene" | "vfx-ltx" | "vfx-reveal";

export const ASPECT_RATIOS = ["9:16", "1:1", "16:9", "3:4"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export interface PaletteColor {
  token: string;
  hex: string;
  use: string;
}

export interface SceneDirection {
  id: string;
  label: string;
  surface: string;
  props: string;
  light: string;
}

export interface Brand {
  id: string;
  name: string;
  website: string;
  tagline: string;
  /** Single source for the mark; SVG fills are currentColor so callers set the color. */
  logo: string;
  palette: PaletteColor[];
  typography: { display: string; supporting: string };
  tone: string;
  audience: string;
  sceneDirections: SceneDirection[];
}

export interface Product {
  id: string;
  name: string;
  pageUrl: string;
  description: string;
  category: string;
  photos: string[];
  primaryPhoto: string;
  reveal?: ProductReveal;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** First and last keyframes for the LTX reveal, plus the sleeve region kept pixel-exact across frames. */
export interface ProductReveal {
  start: string;
  end: string;
  sleeveRect: Rect;
}

/** Per-stage parameters a binder writes into its workflow. */
export interface StageParams {
  imagePath: string;
  aspect: AspectRatio;
  prompt: string;
  seed: number;
  /** Scene only: "fast" uses the 4-step Lightning LoRA, "full" runs 20 steps for sharper small text. */
  quality?: "fast" | "full";
  /** VFX only: last keyframe, and its region (source px) pasted onto every frame. */
  endImagePath?: string;
  pasteRect?: Rect;
  /** VFX only: last-keyframe guide strength; the workflow default is 0.7. */
  endStrength?: number;
}

export type JobStatus = "queued" | "running" | "canceling" | "succeeded" | "canceled" | "failed" | "expired";

export const TERMINAL_STATUSES: readonly JobStatus[] = ["succeeded", "canceled", "failed", "expired"];

export type OutputKind = "image" | "video";

export interface StageJob {
  id: string;
  idempotencyKey: string;
  stage: StageName;
  /** Groups the variants of one run, for example the three scene stills. */
  runId: string;
  label: string;
  aspect: AspectRatio;
  seed: number;
  comfyJobId: string;
  status: JobStatus;
  queuePosition: number | null;
  errorType: string | null;
  errorMessage: string | null;
  outputFile: string | null;
  outputKind: OutputKind | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** What the browser sees: no filesystem paths, no Comfy internals beyond the job ID. */
export interface JobView {
  id: string;
  stage: StageName;
  runId: string;
  label: string;
  aspect: AspectRatio;
  seed: number;
  comfyJobId: string;
  status: JobStatus;
  queuePosition: number | null;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  outputUrl: string | null;
  outputKind: OutputKind | null;
  waitTimeoutSeconds: number;
}

export interface ApiError {
  error: string;
  code?: string;
}
