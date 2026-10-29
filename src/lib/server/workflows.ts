import type { Comfy } from "@comfyorg/sdk";
import { imageSizeFromFile } from "image-size/fromFile";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Rect, StageName, StageParams } from "@/lib/types";
import { dataPath } from "./config";
import {
  HERO_SIZE,
  PRODUCT_HEIGHT_SHARE,
  SCENE_CANVAS,
  VIDEO_SIZE,
  castShadow,
  contactShadow,
  mapRectToCover,
  placeProduct,
  seatProduct,
  type Size,
} from "./geometry";

type Workflow = Awaited<ReturnType<Comfy["workflows"]["fromFile"]>>;
type Binder = (workflow: Workflow, client: Comfy, params: StageParams) => Promise<void>;

interface StageSpec {
  file: string;
  bind: Binder;
  /** Node whose output is the stage's result. */
  outputNode: string;
  /** Secondary outputs kept with the job, by name. */
  extraOutputs?: Record<string, string>;
}

const DEFAULT_HERO_SECONDS = 4;

async function sizeOf(imagePath: string): Promise<Size> {
  const size = await imageSizeFromFile(imagePath);
  if (!size.width || !size.height) throw new Error(`Cannot read image size: ${path.basename(imagePath)}`);
  return { width: size.width, height: size.height };
}

/** The template's switch: true routes through the Lightning LoRA (4 steps, cfg 1), false runs 20 steps at cfg 4. */
function bindQwen(workflow: Workflow, { prompt, seed, quality = "fast" }: StageParams): void {
  workflow.setInput("433:111", "prompt", prompt);
  workflow.setInput("433:3", "seed", seed);
  workflow.setInput("433:443", "value", quality === "fast");
}

function bindShadows(workflow: Workflow, place: Rect, canvas: Size, cast?: Rect): void {
  for (const node of ["31", "36", "38"]) {
    workflow.setInput(node, "width", canvas.width);
    workflow.setInput(node, "height", canvas.height);
  }
  const contact = contactShadow(place);
  workflow.setInput("30", "width", contact.width);
  workflow.setInput("30", "height", contact.height);
  workflow.setInput("32", "x", contact.x);
  workflow.setInput("32", "y", contact.y);
  if (!cast) return;
  workflow.setInput("29", "width", cast.width);
  workflow.setInput("29", "height", cast.height);
  workflow.setInput("28", "x", cast.x);
  workflow.setInput("28", "y", cast.y);
}

// Option B catalog still in one pass: empty set, original cutout composited with a contact shadow.
const bindScene: Binder = async (workflow, client, params) => {
  const canvas = SCENE_CANVAS[params.aspect];
  const place = placeProduct(await sizeOf(params.imagePath), canvas, PRODUCT_HEIGHT_SHARE[params.aspect]);
  workflow.setInput("78", "image", client.assets.fromFile(params.imagePath));
  workflow.setInput("14", "width", canvas.width);
  workflow.setInput("14", "height", canvas.height);
  workflow.setInput("11", "width", place.width);
  workflow.setInput("11", "height", place.height);
  workflow.setInput("21", "x", place.x);
  workflow.setInput("21", "y", place.y);
  bindShadows(workflow, place, canvas);
  bindQwen(workflow, params);
};

// Art-directed concept set, rendered without the product.
const bindSceneSet: Binder = async (workflow, _client, params) => {
  const canvas = SCENE_CANVAS[params.aspect];
  workflow.setInput("14", "width", canvas.width);
  workflow.setInput("14", "height", canvas.height);
  bindQwen(workflow, params);
};

// Edit an existing set (same size out), for example adding the frozen splash to a calm set.
const bindSceneEdit: Binder = async (workflow, client, params) => {
  workflow.setInput("78", "image", client.assets.fromFile(params.imagePath));
  bindQwen(workflow, params);
};

// Seat the cutout on the set, shadows from the light side, harmonize, then paste the protected glyphs back.
const bindSceneComposite: Binder = async (workflow, client, params) => {
  const { composite } = params;
  if (!composite) throw new Error("scene-composite needs composite parameters.");
  const canvas = await sizeOf(composite.setImagePath);
  const place = seatProduct(await sizeOf(params.imagePath), canvas, composite.heightShare, composite.surfaceY);

  workflow.setInput("1", "image", client.assets.fromFile(composite.setImagePath));
  workflow.setInput("78", "image", client.assets.fromFile(params.imagePath));
  workflow.setInput("79", "image", client.assets.fromFile(composite.protectMaskPath));
  for (const node of ["11", "61"]) {
    workflow.setInput(node, "width", place.width);
    workflow.setInput(node, "height", place.height);
  }
  for (const node of ["21", "64"]) {
    workflow.setInput(node, "x", place.x);
    workflow.setInput(node, "y", place.y);
  }
  workflow.setInput("63", "width", canvas.width);
  workflow.setInput("63", "height", canvas.height);
  bindShadows(workflow, place, canvas, castShadow(place, composite.lightFrom, canvas));
  bindQwen(workflow, params);
};

/** A white-on-black mask PNG for a rect in an image's pixel space, cached by geometry. */
async function rectMask(rect: Rect, size: Size): Promise<string> {
  const file = dataPath("masks", `rect-${size.width}x${size.height}-${rect.x}-${rect.y}-${rect.width}-${rect.height}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await sharp({ create: { width: size.width, height: size.height, channels: 3, background: "#000000" } })
    .composite([{ input: { create: { width: rect.width, height: rect.height, channels: 3, background: "#ffffff" } }, left: rect.x, top: rect.y }])
    .png()
    .toFile(file);
  return file;
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

// First and last frames are both keyframed; the end frame's protected pixels are pasted onto every
// frame (a mask image resized exactly like the frames) so label text never drifts.
const bindVfxReveal: Binder = async (workflow, client, params) => {
  const { imagePath, endImagePath, pasteRect, pasteMaskPath, endStrength, aspect, prompt, seed } = params;
  if (!endImagePath) throw new Error("The VFX reveal needs a last frame (endImagePath).");
  if (!pasteMaskPath && !pasteRect) throw new Error("The VFX reveal needs a paste mask or rect.");
  if (endStrength !== undefined) {
    workflow.setInput("204", "strength", endStrength);
    workflow.setInput("205", "strength", endStrength);
  }
  const size = VIDEO_SIZE[aspect];
  workflow.setInput("98", "image", client.assets.fromFile(imagePath));
  workflow.setInput("200", "image", client.assets.fromFile(endImagePath));
  for (const node of ["102", "201", "209"]) {
    workflow.setInput(node, "resize_type.width", size.width);
    workflow.setInput(node, "resize_type.height", size.height);
  }
  const mask = pasteMaskPath ?? (await rectMask(pasteRect as Rect, await sizeOf(endImagePath)));
  workflow.setInput("207", "image", client.assets.fromFile(mask));
  workflow.setInput("92:3", "text", prompt);
  workflow.setInput("92:11", "noise_seed", seed);
  workflow.setInput("92:67", "noise_seed", seed);
};

/** Size and place the H3 sleeve-paste mask, mapping source pixels through the frames' center-crop resize. */
async function bindHeroPaste(workflow: Workflow, size: Size, endImagePath: string, pasteRect?: Rect): Promise<void> {
  workflow.setInput("140", "width", size.width);
  workflow.setInput("140", "height", size.height);
  if (!pasteRect) {
    workflow.setInput("141", "value", 0);
    return;
  }
  const mapped = mapRectToCover(pasteRect, await sizeOf(endImagePath), size);
  workflow.setInput("141", "width", mapped.width);
  workflow.setInput("141", "height", mapped.height);
  workflow.setInput("142", "x", mapped.x);
  workflow.setInput("142", "y", mapped.y);
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
  await bindHeroPaste(workflow, size, endImagePath, pasteRect);
};

const STAGES: Record<StageName, StageSpec> = {
  scene: { file: "scene.json", bind: bindScene, outputNode: "469" },
  "scene-set": { file: "scene-set.json", bind: bindSceneSet, outputNode: "469" },
  "scene-edit": { file: "scene-edit.json", bind: bindSceneEdit, outputNode: "469" },
  "scene-composite": { file: "scene-composite.json", bind: bindSceneComposite, outputNode: "469", extraOutputs: { protectMask: "68" } },
  "vfx-ltx": { file: "vfx-ltx.json", bind: bindVfxSingle, outputNode: "75" },
  "vfx-reveal": { file: "vfx-ltx-reveal.json", bind: bindVfxReveal, outputNode: "75" },
  "hero-h3": { file: "hero-h3.json", bind: bindHero, outputNode: "92" },
};

export function stageOutputs(stage: StageName): Pick<StageSpec, "outputNode" | "extraOutputs"> {
  const { outputNode, extraOutputs } = STAGES[stage];
  return { outputNode, extraOutputs };
}

export async function buildWorkflow(client: Comfy, stage: StageName, params: StageParams): Promise<Workflow> {
  const spec = STAGES[stage];
  const workflow = await client.workflows.fromFile(path.join(process.cwd(), "workflows", spec.file));
  await spec.bind(workflow, client, params);
  return workflow;
}
