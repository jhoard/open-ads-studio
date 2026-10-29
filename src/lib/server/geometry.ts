import type { AspectRatio, LightSide, Rect } from "@/lib/types";

// Pure layout math for compositing the product into a set. No I/O, no models.

export interface Size {
  width: number;
  height: number;
}

export type Placement = Rect;

// Qwen-Image-Edit works best near one megapixel; sides are multiples of 64.
export const SCENE_CANVAS: Record<AspectRatio, Size> = {
  "9:16": { width: 768, height: 1344 },
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "3:4": { width: 896, height: 1152 },
};

// LTX-2 renders at half size then upsamples 2x, so both sides must be multiples of 64
// (720 is not: LTX silently rounds it to 704 and the protected paste misaligns).
export const VIDEO_SIZE: Record<AspectRatio, Size> = {
  "9:16": { width: 704, height: 1280 },
  "1:1": { width: 960, height: 960 },
  "16:9": { width: 1280, height: 704 },
  "3:4": { width: 832, height: 1088 },
};

// MiniMax H3 base renders natively at 768p on the short side; sides on a 32 px grid.
export const HERO_SIZE: Record<AspectRatio, Size> = {
  "9:16": { width: 768, height: 1344 },
  "1:1": { width: 768, height: 768 },
  "16:9": { width: 1344, height: 768 },
  "3:4": { width: 768, height: 1024 },
};

// How tall the product stands in a catalog scene, as a share of canvas height.
export const PRODUCT_HEIGHT_SHARE: Record<AspectRatio, number> = { "9:16": 0.5, "1:1": 0.62, "16:9": 0.72, "3:4": 0.56 };
const MAX_PRODUCT_WIDTH_SHARE = 0.7;
// Catalog scenes: gap between the product's base and the bottom edge.
const FLOOR_MARGIN_SHARE = 0.14;
// Seated scenes: the base sits just in front of the detected surface line, never off the frame.
const SEAT_DEPTH_SHARE = 0.02;
const SEAT_RANGE = { min: 0.6, max: 0.95 };
const DEFAULT_SEAT_SHARE = 0.86;
const MIN_TOP_SHARE = 0.05;

function fit(source: Size, canvas: Size, maxHeight: number): Size {
  const scale = Math.min(maxHeight / source.height, (canvas.width * MAX_PRODUCT_WIDTH_SHARE) / source.width);
  return { width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
}

/** Catalog placement: centered, resting above a fixed floor margin. */
export function placeProduct(source: Size, canvas: Size, heightShare: number): Placement {
  const size = fit(source, canvas, canvas.height * heightShare);
  const x = Math.round((canvas.width - size.width) / 2);
  const y = Math.max(0, Math.round(canvas.height * (1 - FLOOR_MARGIN_SHARE)) - size.height);
  return { ...size, x, y };
}

/** Seated placement: centered, base on the set's surface line, top kept inside the frame. */
export function seatProduct(source: Size, canvas: Size, heightShare: number, surfaceY: number | null): Placement {
  const seat = surfaceY === null ? canvas.height * DEFAULT_SEAT_SHARE : surfaceY + canvas.height * SEAT_DEPTH_SHARE;
  const base = Math.round(Math.min(canvas.height * SEAT_RANGE.max, Math.max(canvas.height * SEAT_RANGE.min, seat)));
  const maxHeight = Math.min(canvas.height * heightShare, base - canvas.height * MIN_TOP_SHARE);
  const size = fit(source, canvas, maxHeight);
  return { ...size, x: Math.round((canvas.width - size.width) / 2), y: base - size.height };
}

// Contact shadow: a tight strip slightly wider than the product, centered on its base.
const CONTACT_WIDTH_SHARE = 1.08;
const CONTACT_HEIGHT_SHARE = 0.07;
// Cast shadow: a softer, longer strip falling away from the light.
const CAST_WIDTH_SHARE = 0.9;
const CAST_HEIGHT_SHARE = 0.09;
const CAST_BACKLIT_WIDTH_SHARE = 1.5;

export function contactShadow(place: Placement): Rect {
  const width = Math.round(place.width * CONTACT_WIDTH_SHARE);
  const height = Math.max(4, Math.round(place.width * CONTACT_HEIGHT_SHARE));
  return { x: Math.round(place.x - (width - place.width) / 2), y: Math.round(place.y + place.height - height / 2), width, height };
}

export function castShadow(place: Placement, lightFrom: LightSide, canvas: Size): Rect {
  const base = place.y + place.height;
  const height = Math.max(6, Math.round(place.width * CAST_HEIGHT_SHARE));
  const width = Math.round(place.width * (lightFrom === "back" ? CAST_BACKLIT_WIDTH_SHARE : CAST_WIDTH_SHARE));
  const center = place.x + place.width / 2;
  const x =
    lightFrom === "left" ? Math.round(center) // light on the left, shadow stretches right
    : lightFrom === "right" ? Math.round(center - width)
    : Math.round(center - width / 2); // backlit: shadow spreads toward the camera, centered
  const clampedX = Math.max(0, Math.min(canvas.width - width, x));
  return { x: clampedX, y: Math.round(base - height / 2), width, height };
}

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
