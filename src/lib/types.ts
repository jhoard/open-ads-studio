/**
 * scene: one-pass option B still. scene-set / scene-edit / scene-composite: the art-directed recipe passes
 * (empty concept set, edit of a set, then seat + shadow + harmonize + protected-glyph paste).
 * vfx-ltx: single image to clip (M0 page). vfx-reveal: LTX-2 first + last keyframe reveal with protected paste.
 * hero-h3: MiniMax H3 first + last keyframe hero with native audio, same paste.
 * scene-relight: the Scene recipe. Qwen relights the packshot in place, then the box is detected and
 * only the protected glyphs are pasted back (tone-matched, plus their reflection).
 */
export type StageName = "scene" | "scene-set" | "scene-edit" | "scene-composite" | "scene-relight" | "vfx-ltx" | "vfx-reveal" | "hero-h3";

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
  /** Protect mask (M3.5) for primaryPhoto: white = label and marks, never repainted. */
  protectMask?: string;
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
  /** VFX only: last-keyframe guide strength; the workflow default is 0.9 (0.7 landed softer, SSIM 0.855 vs 0.897). */
  endStrength?: number;
  /** Hero only: clip length in seconds (H3 snaps to its 17k+5 frame grid at 24 fps). */
  durationSeconds?: number;
  /** VFX only: mask image in keyframe px (white = paste from the end frame); takes precedence over pasteRect. */
  pasteMaskPath?: string;
  /** scene-composite only. */
  composite?: CompositeParams;
}

export type LightSide = "left" | "right" | "back";

export interface CompositeParams {
  setImagePath: string;
  /** Protected glyph mask in packshot px (white = never repainted). */
  protectMaskPath: string;
  /** Product height as a share of the set height. */
  heightShare: number;
  /** Set row where the backdrop meets the standing surface, from set analysis; null falls back to a default. */
  surfaceY: number | null;
  lightFrom: LightSide;
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
  /** Secondary outputs by name, for example the placed protect mask of a composite. */
  extraFiles?: Record<string, string>;
  /** Post-step inputs for scene-relight: the source packshot and its protect mask (server paths). */
  glyphPaste?: { packshotPath: string; protectMaskPath: string };
  /** Post-step inputs for a cinemagraph: the Scene still it animates, and the packshot and mask behind its label. */
  clipPaste?: { stillPath: string; packshotPath: string; protectMaskPath: string };
  /** Label match after the glyph paste, and of the model's own output, 0 to 1. */
  labelMatch?: { final: number; model: number | null };
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
  /** The model's output before the glyph paste, when the stage has one. */
  rawUrl: string | null;
  labelMatch: number | null;
  modelLabelMatch: number | null;
  waitTimeoutSeconds: number;
}

export interface ApiError {
  error: string;
  code?: string;
}
