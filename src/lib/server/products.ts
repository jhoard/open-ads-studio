import { Comfy } from "@comfyorg/sdk";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import sharp, { type Metadata } from "sharp";
import { MASK_THRESHOLD, buildGlyphMask, lumaOf, type MaskBox } from "@/lib/glyph-mask";
import type { UploadedProductView } from "@/lib/studio";
import { TERMINAL_STATUSES, type JobStatus } from "@/lib/types";
import { MAX_UPLOAD_BYTES } from "./config";
import { localFile, store, workDir } from "./store";
import { buildWorkflow } from "./workflows";

// Bring your own product: an upload is validated, re-encoded (which drops EXIF and any other metadata),
// cut out with BiRefNet on Comfy Cloud, and placed on a neutral ground as the packshot. The visitor then
// draws boxes over the label; the glyph mask is built inside them.

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const MIN_SIDE = 256;
const MAX_INPUT_SIDE = 12000;
const MAX_STORED_SIDE = 1536;
const PACKSHOT_GROUND = "#ebe9e5";
const MAX_NAME_LENGTH = 60;
const PRODUCT_ID_PATTERN = /^[0-9a-f-]{36}$/i;

export interface UploadedProduct {
  id: string;
  visitor: string;
  name: string;
  status: "cutting" | "ready" | "failed";
  error: string | null;
  cutoutJobId: string;
  width: number;
  height: number;
  boxes: MaskBox[];
  threshold: number;
  protectedShare: number | null;
  createdAt: string;
}

export class UploadError extends Error {}

const productKey = (id: string, file = "product.json"): string => `products/${id}/${file}`;
export const productRef = (id: string, file: string): string => `store:${productKey(id, file)}`;
export const isProductId = (id: string): boolean => PRODUCT_ID_PATTERN.test(id);

export async function loadUpload(id: string, visitor: string): Promise<UploadedProduct | null> {
  if (!isProductId(id)) return null;
  const stored = await store().readJson<UploadedProduct>(productKey(id));
  // Uploads are private to the visitor who made them.
  return stored && stored.value.visitor === visitor ? stored.value : null;
}

const saveUpload = (product: UploadedProduct): Promise<boolean> => store().writeJson(productKey(product.id), product);

export function toProductView(product: UploadedProduct): UploadedProductView {
  const file = (name: string): string => `/api/products/${product.id}/file/${name}`;
  return {
    id: product.id,
    name: product.name,
    status: product.status,
    error: product.error,
    photoUrl: file("photo"),
    packshotUrl: product.status === "ready" ? file("packshot") : null,
    cutoutUrl: product.status === "ready" ? file("cutout") : null,
    maskUrl: product.protectedShare !== null ? `${file("mask")}?alpha=1&v=${product.threshold}-${product.boxes.length}` : null,
    boxes: product.boxes,
    threshold: product.threshold,
    protectedShare: product.protectedShare,
  };
}

/** Validate and normalise an upload: real PNG/JPEG/WebP by content, size-capped, EXIF orientation applied then dropped. */
async function normalise(data: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  if (data.length === 0) throw new UploadError("The file is empty.");
  if (data.length > MAX_UPLOAD_BYTES) throw new UploadError("The photo is larger than 10 MB.");
  let meta: Metadata;
  try {
    meta = await sharp(data).metadata();
  } catch {
    throw new UploadError("That file is not a readable image.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new UploadError("Upload a PNG, JPEG or WebP photo.");
  const { width = 0, height = 0 } = meta;
  if (Math.min(width, height) < MIN_SIDE) throw new UploadError(`The photo is too small; use at least ${MIN_SIDE} px on the short side.`);
  if (Math.max(width, height) > MAX_INPUT_SIDE) throw new UploadError("The photo is too large in pixels.");
  // rotate() applies the EXIF orientation; sharp writes no metadata unless asked, so EXIF and GPS are gone.
  const { data: png, info } = await sharp(data).rotate().resize(MAX_STORED_SIDE, MAX_STORED_SIDE, { fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { png, width: info.width, height: info.height };
}

/** Store the photo and start its cutout. The product is ready once the cutout lands. */
export async function createUpload(data: Buffer, rawName: string, visitor: string): Promise<UploadedProduct> {
  const { png, width, height } = await normalise(data);
  const id = randomUUID();
  await store().putFile(productKey(id, "photo.png"), png, "image/png");
  const client = new Comfy();
  const workflow = await buildWorkflow(client, "cutout", { imagePath: await localFile(productKey(id, "photo.png")), aspect: "3:4", prompt: "", seed: 0 });
  const submitted = await client.submit(workflow);
  const name = rawName.replace(/[^\p{L}\p{N} .,&'-]/gu, "").trim().slice(0, MAX_NAME_LENGTH) || "Your product";
  const product: UploadedProduct = {
    id,
    visitor,
    name,
    status: "cutting",
    error: null,
    cutoutJobId: submitted.id,
    width,
    height,
    boxes: [],
    threshold: MASK_THRESHOLD.default,
    protectedShare: null,
    createdAt: new Date().toISOString(),
  };
  await saveUpload(product);
  return product;
}

/** Poll the cutout; when it lands, store it and compose the packshot on a neutral ground. */
export async function syncUpload(product: UploadedProduct): Promise<UploadedProduct> {
  if (product.status !== "cutting") return product;
  const job = await new Comfy().jobs.get(product.cutoutJobId);
  if (!TERMINAL_STATUSES.includes(job.status as JobStatus)) return product;
  const output = job.status === "succeeded" ? job.getOutputs("3").find((candidate) => candidate.contentType.startsWith("image/")) : undefined;
  if (!output) {
    const failed = { ...product, status: "failed" as const, error: "The cutout did not run. Try another photo." };
    await saveUpload(failed);
    return failed;
  }
  const local = workDir("products", product.id, "cutout-download.png");
  await mkdir(workDir("products", product.id), { recursive: true });
  await output.toFile(local);
  // The cutout comes back at the photo's size; keep it exactly aligned with the photo.
  const cutout = await sharp(local).ensureAlpha().resize(product.width, product.height, { fit: "fill" }).png().toBuffer();
  const opaque = await coverage(cutout);
  if (opaque < 0.01) {
    const failed = { ...product, status: "failed" as const, error: "No product was found in the photo. Try a clearer shot on a plain background." };
    await saveUpload(failed);
    return failed;
  }
  const packshot = await sharp({ create: { width: product.width, height: product.height, channels: 3, background: PACKSHOT_GROUND } })
    .composite([{ input: cutout }])
    .png()
    .toBuffer();
  await store().putFile(productKey(product.id, "cutout.png"), cutout, "image/png");
  await store().putFile(productKey(product.id, "packshot.png"), packshot, "image/png");
  const ready = { ...product, status: "ready" as const };
  await saveUpload(ready);
  return ready;
}

async function coverage(rgba: Buffer): Promise<number> {
  const { data, info } = await sharp(rgba).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i++) if (data[i] >= 128) on++;
  return on / (info.width * info.height);
}

/** Rebuild the glyph mask from the visitor's boxes and threshold, on the packshot, inside the product. */
export async function updateMask(product: UploadedProduct, boxes: MaskBox[], threshold: number): Promise<UploadedProduct> {
  if (product.status !== "ready") throw new UploadError("The product is still being cut out.");
  const clamped = Math.round(Math.min(MASK_THRESHOLD.max, Math.max(MASK_THRESHOLD.min, threshold)));
  const [packshot, cutout] = await Promise.all([store().readFile(productKey(product.id, "packshot.png")), store().readFile(productKey(product.id, "cutout.png"))]);
  if (!packshot || !cutout) throw new UploadError("The product files are missing; upload it again.");
  const { data: rgb, info } = await sharp(packshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: alpha } = await sharp(cutout).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const luma = new Float32Array(info.width * info.height);
  for (let i = 0; i < luma.length; i++) luma[i] = lumaOf(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  const mask = buildGlyphMask(luma, alpha, info.width, info.height, boxes, clamped);
  let on = 0;
  for (const value of mask) if (value) on++;
  if (on === 0) throw new UploadError("No label detail was found inside the boxes. Draw them over the text, or lower the threshold.");
  const png = await sharp(Buffer.from(mask), { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
  await store().putFile(productKey(product.id, "mask.png"), png, "image/png");
  const updated = { ...product, boxes, threshold: clamped, protectedShare: on / mask.length };
  await saveUpload(updated);
  return updated;
}

export const UPLOAD_FILES = { photo: "photo.png", packshot: "packshot.png", mask: "mask.png", cutout: "cutout.png" } as const;
export type UploadFile = keyof typeof UPLOAD_FILES;

export const readUploadFile = (product: UploadedProduct, file: UploadFile): Promise<Buffer | null> => store().readFile(productKey(product.id, UPLOAD_FILES[file]));
