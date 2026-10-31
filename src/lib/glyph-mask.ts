// Build a protect mask from boxes drawn over a label: inside each box, pixels that differ from the
// box's own background by more than the threshold are glyphs. Pure, so the browser previews exactly
// what the server stores.

/** A box in image fractions (0 to 1), so it survives any display size. */
export interface MaskBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MASK_THRESHOLD = { min: 8, max: 120, default: 40 } as const;
export const MAX_MASK_BOXES = 6;
const MIN_BOX_PX = 6;
const BORDER_PX = 2; // ring sampled for the box's local background
const GROW_PX = 1; // include each glyph's anti-aliased edge

export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function toPixels(box: MaskBox, width: number, height: number): PixelBox | null {
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width - 1, Math.ceil((box.x + box.width) * width) - 1);
  const y1 = Math.min(height - 1, Math.ceil((box.y + box.height) * height) - 1);
  return x1 - x0 + 1 >= MIN_BOX_PX && y1 - y0 + 1 >= MIN_BOX_PX ? { x0, y0, x1, y1 } : null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Luminance of the box's border ring: the label's background, whatever color it is. */
function backgroundOf(luma: ArrayLike<number>, width: number, box: PixelBox): number {
  const ring: number[] = [];
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const edge = Math.min(x - box.x0, box.x1 - x, y - box.y0, box.y1 - y);
      if (edge < BORDER_PX) ring.push(luma[y * width + x]);
    }
  }
  return median(ring);
}

/**
 * Glyph mask (0 or 255 per pixel). `luma` is 0-255 luminance; `alpha`, when given, keeps the mask on the
 * product only (the cutout's opaque pixels).
 */
export function buildGlyphMask(luma: ArrayLike<number>, alpha: ArrayLike<number> | null, width: number, height: number, boxes: MaskBox[], threshold: number): Uint8Array {
  const core = new Uint8Array(width * height);
  for (const box of boxes) {
    const px = toPixels(box, width, height);
    if (!px) continue;
    const background = backgroundOf(luma, width, px);
    for (let y = px.y0; y <= px.y1; y++) {
      for (let x = px.x0; x <= px.x1; x++) {
        const i = y * width + x;
        if (alpha && alpha[i] < 128) continue;
        if (Math.abs(luma[i] - background) > threshold) core[i] = 255;
      }
    }
  }
  const grown = new Uint8Array(core);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!core[y * width + x]) continue;
      for (let dy = -GROW_PX; dy <= GROW_PX; dy++) {
        for (let dx = -GROW_PX; dx <= GROW_PX; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < height && xx >= 0 && xx < width) grown[yy * width + xx] = 255;
        }
      }
    }
  }
  return grown;
}

export const lumaOf = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Validate boxes from an untrusted source. */
export function parseBoxes(value: unknown): MaskBox[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MASK_BOXES) return null;
  const boxes: MaskBox[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { x, y, width, height } = item as Record<string, unknown>;
    const nums = [x, y, width, height];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) return null;
    if ((x as number) + (width as number) > 1.0001 || (y as number) + (height as number) > 1.0001) return null;
    boxes.push({ x: x as number, y: y as number, width: width as number, height: height as number });
  }
  return boxes;
}
