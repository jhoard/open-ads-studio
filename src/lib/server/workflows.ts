import type { Comfy } from "@comfyorg/sdk";
import { imageSizeFromFile } from "image-size/fromFile";
import path from "node:path";
import type { AspectRatio, Rect, StageName, StageParams } from "@/lib/types";

type Workflow = Awaited<ReturnType<Comfy["workflows"]["fromFile"]>>;

interface Size {
  width: number;
  height: number;
}

export interface Placement extends Size {
  x: number;
  y: number;
}

// Qwen-Image-Edit works best near one megapixel; sides are multiples of 64.
const SCENE_CANVAS: Record<AspectRatio, Size> = {
  "9:16": { width: 768, height: 1344 },
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "3:4": { width: 896, height: 1152 },
};

// LTX-2 renders at half size then upsamples 2x; these keep both passes on a 32 px grid.
const VIDEO_SIZE: Record<AspectRatio, Size> = {
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 960, height: 960 },
  "16:9": { width: 1280, height: 720 },
  "3:4": { width: 832, height: 1088 },
};

// How tall the product stands in the scene, as a share of canvas height.
const PRODUCT_HEIGHT_SHARE: Record<AspectRatio, number> = { "9:16": 0.5, "1:1": 0.62, "16:9": 0.72, "3:4": 0.56 };
const MAX_PRODUCT_WIDTH_SHARE = 0.7;
// Gap between the product's base and the bottom edge, so it sits on a surface rather than the frame.
const FLOOR_MARGIN_SHARE = 0.14;

/** Fit the cutout inside the canvas, centered horizontally, resting above the floor margin. */
export function placeProduct(source: Size, canvas: Size, heightShare: number): Placement {
  const scale = Math.min((canvas.height * heightShare) / source.height, (canvas.width * MAX_PRODUCT_WIDTH_SHARE) / source.width);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const x = Math.round((canvas.width - width) / 2);
  const y = Math.max(0, Math.round(canvas.height * (1 - FLOOR_MARGIN_SHARE)) - height);
  return { width, height, x, y };
}

// Contact shadow: a flat strip slightly wider than the product, centered on its base, blurred in the workflow.
const SHADOW_WIDTH_SHARE = 1.08;
const SHADOW_HEIGHT_SHARE = 0.07;

export function contactShadow(place: Placement): Rect {
  const width = Math.round(place.width * SHADOW_WIDTH_SHARE);
  const height = Math.max(4, Math.round(place.width * SHADOW_HEIGHT_SHARE));
  return { x: Math.round(place.x - (width - place.width) / 2), y: Math.round(place.y + place.height - height / 2), width, height };
}

type Binder = (workflow: Workflow, client: Comfy, params: StageParams) => Promise<void>;

interface StageSpec {
  file: string;
  bind: Binder;
}

const bindScene: Binder = async (workflow, client, { imagePath, aspect, prompt, seed, quality = "fast" }) => {
  const source = await imageSizeFromFile(imagePath);
  if (!source.width || !source.height) throw new Error(`Cannot read image size: ${path.basename(imagePath)}`);
  const canvas = SCENE_CANVAS[aspect];
  const place = placeProduct({ width: source.width, height: source.height }, canvas, PRODUCT_HEIGHT_SHARE[aspect]);

  workflow.setInput("78", "image", client.assets.fromFile(imagePath));
  workflow.setInput("14", "width", canvas.width);
  workflow.setInput("14", "height", canvas.height);
  workflow.setInput("11", "width", place.width);
  workflow.setInput("11", "height", place.height);
  // Qwen generates an empty set; the original cutout is composited on top with a soft contact
  // shadow, so the label stays pixel-identical to the packshot instead of being redrawn.
  workflow.setInput("21", "x", place.x);
  workflow.setInput("21", "y", place.y);
  const shadow = contactShadow(place);
  for (const node of ["31", "36", "38"]) {
    workflow.setInput(node, "width", canvas.width);
    workflow.setInput(node, "height", canvas.height);
  }
  workflow.setInput("30", "width", shadow.width);
  workflow.setInput("30", "height", shadow.height);
  workflow.setInput("32", "x", shadow.x);
  workflow.setInput("32", "y", shadow.y);
  workflow.setInput("433:111", "prompt", prompt);
  workflow.setInput("433:3", "seed", seed);
  // The template's switch: true routes through the Lightning LoRA (4 steps, cfg 1), false runs 20 steps at cfg 4.
  workflow.setInput("433:443", "value", quality === "fast");
};

/** Where a source-pixel rect lands after the resize node's cover-scale and center crop. */
export function mapRectToCover(rect: Rect, source: Size, target: Size): Rect {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const offsetX = (source.width * scale - target.width) / 2;
  const offsetY = (source.height * scale - target.height) / 2;
  const x = Math.max(0, Math.round(rect.x * scale - offsetX));
  const y = Math.max(0, Math.round(rect.y * scale - offsetY));
  return {
    x,
    y,
    width: Math.min(target.width - x, Math.round(rect.width * scale)),
    height: Math.min(target.height - y, Math.round(rect.height * scale)),
  };
}

const bindVfxSingle: Binder = async (workflow, client, { imagePath, aspect, prompt, seed }) => {
  const size = VIDEO_SIZE[aspect];
  workflow.setInput("98", "image", client.assets.fromFile(imagePath));
  workflow.setInput("102", "resize_type.width", size.width);
  workflow.setInput("102", "resize_type.height", size.height);
  workflow.setInput("92:3", "text", prompt);
  workflow.setInput("92:11", "noise_seed", seed);
  workflow.setInput("92:67", "noise_seed", seed);
};

// First and last frames are both keyframed; the end frame's sleeve is pasted onto every frame
// so label text never drifts while the bar and foil animate above it.
const bindVfxReveal: Binder = async (workflow, client, { imagePath, endImagePath, pasteRect, endStrength, aspect, prompt, seed }) => {
  if (!endImagePath) throw new Error("The VFX reveal needs a last frame (endImagePath).");
  if (endStrength !== undefined) {
    workflow.setInput("204", "strength", endStrength);
    workflow.setInput("205", "strength", endStrength);
  }
  const size = VIDEO_SIZE[aspect];
  workflow.setInput("98", "image", client.assets.fromFile(imagePath));
  workflow.setInput("200", "image", client.assets.fromFile(endImagePath));
  for (const node of ["102", "201"]) {
    workflow.setInput(node, "resize_type.width", size.width);
    workflow.setInput(node, "resize_type.height", size.height);
  }
  workflow.setInput("92:3", "text", prompt);
  workflow.setInput("92:11", "noise_seed", seed);
  workflow.setInput("92:67", "noise_seed", seed);

  await bindSleevePaste(workflow, { canvas: "207", region: "208", place: "209" }, size, endImagePath, pasteRect);
};

// MiniMax H3 base renders natively at 768p on the short side; sides on a 32 px grid.
const HERO_SIZE: Record<AspectRatio, Size> = {
  "9:16": { width: 768, height: 1344 },
  "1:1": { width: 768, height: 768 },
  "16:9": { width: 1344, height: 768 },
  "3:4": { width: 768, height: 1024 },
};
const DEFAULT_HERO_SECONDS = 4;

/** Size and place the sleeve-paste mask, mapping source pixels through the frames' center-crop resize. */
async function bindSleevePaste(workflow: Workflow, nodes: { canvas: string; region: string; place: string }, size: Size, endImagePath: string, pasteRect?: Rect): Promise<void> {
  workflow.setInput(nodes.canvas, "width", size.width);
  workflow.setInput(nodes.canvas, "height", size.height);
  if (!pasteRect) {
    workflow.setInput(nodes.region, "value", 0);
    return;
  }
  const source = await imageSizeFromFile(endImagePath);
  if (!source.width || !source.height) throw new Error(`Cannot read image size: ${path.basename(endImagePath)}`);
  const mapped = mapRectToCover(pasteRect, { width: source.width, height: source.height }, size);
  workflow.setInput(nodes.region, "width", mapped.width);
  workflow.setInput(nodes.region, "height", mapped.height);
  workflow.setInput(nodes.place, "x", mapped.x);
  workflow.setInput(nodes.place, "y", mapped.y);
}

const bindHero: Binder = async (workflow, client, { imagePath, endImagePath, pasteRect, aspect, prompt, seed, durationSeconds }) => {
  if (!endImagePath) throw new Error("The H3 hero needs a last frame (endImagePath).");
  const size = HERO_SIZE[aspect];
  workflow.setInput("114", "image", client.assets.fromFile(imagePath));
  workflow.setInput("131", "image", client.assets.fromFile(endImagePath));
  for (const node of ["130", "132"]) {
    workflow.setInput(node, "resize_type.width", size.width);
    workflow.setInput(node, "resize_type.height", size.height);
  }
  workflow.setInput("105:104", "width", size.width);
  workflow.setInput("105:104", "height", size.height);
  workflow.setInput("105:104", "prompt", prompt);
  workflow.setInput("105:15", "noise_seed", seed);
  workflow.setInput("105:111", "value", durationSeconds ?? DEFAULT_HERO_SECONDS);
  await bindSleevePaste(workflow, { canvas: "140", region: "141", place: "142" }, size, endImagePath, pasteRect);
};

const STAGES: Record<StageName, StageSpec> = {
  scene: { file: "scene.json", bind: bindScene },
  "vfx-ltx": { file: "vfx-ltx.json", bind: bindVfxSingle },
  "vfx-reveal": { file: "vfx-ltx-reveal.json", bind: bindVfxReveal },
  "hero-h3": { file: "hero-h3.json", bind: bindHero },
};

export async function buildWorkflow(client: Comfy, stage: StageName, params: StageParams): Promise<Workflow> {
  const spec = STAGES[stage];
  const workflow = await client.workflows.fromFile(path.join(process.cwd(), "workflows", spec.file));
  await spec.bind(workflow, client, params);
  return workflow;
}
