import sharp from "sharp";
import type { LightSide } from "@/lib/types";

// Reads a generated set to decide where the product stands and which way its shadow falls.
// Deterministic image statistics; no model involved.

export interface SetAnalysis {
  width: number;
  height: number;
  /** Row (set px) where the backdrop meets the standing surface, or null if no clear edge. */
  surfaceY: number | null;
  lightFrom: LightSide;
}

const ANALYSIS_WIDTH = 128;
// The product stands in the middle, so the surface edge is measured in the central band only.
const BAND = { from: 0.35, to: 0.65 };
const SURFACE_SEARCH = { from: 0.55, to: 0.95 };
const EDGE_SPAN = 4;
const MIN_EDGE_CONTRAST = 6;
const MIN_LIGHT_CONTRAST = 8;

export async function analyzeSet(imagePath: string): Promise<SetAnalysis> {
  const meta = await sharp(imagePath).metadata();
  if (!meta.width || !meta.height) throw new Error(`Cannot read set image: ${imagePath}`);
  const { data, info } = await sharp(imagePath).resize({ width: ANALYSIS_WIDTH }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const rowMean = (y: number, x0: number, x1: number): number => {
    let sum = 0;
    for (let x = x0; x < x1; x++) sum += data[y * w + x];
    return sum / Math.max(1, x1 - x0);
  };
  const bandX0 = Math.round(w * BAND.from);
  const bandX1 = Math.round(w * BAND.to);
  const band = Array.from({ length: h }, (_, y) => rowMean(y, bandX0, bandX1));

  let bestY = -1;
  let bestContrast = 0;
  for (let y = Math.round(h * SURFACE_SEARCH.from); y < Math.round(h * SURFACE_SEARCH.to); y++) {
    if (y - EDGE_SPAN < 0 || y + EDGE_SPAN >= h) continue;
    let above = 0;
    let below = 0;
    for (let k = 1; k <= EDGE_SPAN; k++) {
      above += band[y - k];
      below += band[y + k];
    }
    const contrast = Math.abs(above - below) / EDGE_SPAN;
    if (contrast > bestContrast) {
      bestContrast = contrast;
      bestY = y;
    }
  }
  const scale = meta.height / h;
  const surfaceY = bestContrast >= MIN_EDGE_CONTRAST ? Math.round(bestY * scale) : null;

  // Light side: compare left and right thirds of the backdrop above the surface.
  const backdropRows = Math.max(2, Math.round((surfaceY === null ? h * 0.6 : bestY) * 0.9));
  let left = 0;
  let right = 0;
  for (let y = Math.round(h * 0.1); y < backdropRows; y++) {
    left += rowMean(y, 0, Math.round(w / 3));
    right += rowMean(y, Math.round((2 * w) / 3), w);
  }
  const rows = Math.max(1, backdropRows - Math.round(h * 0.1));
  const diff = (left - right) / rows;
  const lightFrom: LightSide = diff > MIN_LIGHT_CONTRAST ? "left" : diff < -MIN_LIGHT_CONTRAST ? "right" : "back";

  return { width: meta.width, height: meta.height, surfaceY, lightFrom };
}
