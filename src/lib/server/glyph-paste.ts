import sharp, { type Sharp } from "sharp";

// Find where the packshot landed in an edited image, then paste only its protected glyphs back.
// The edit model may reframe the shot: detect the box, then refine scale and offset by
// normalized cross-correlation of gradient magnitude, which survives relighting.

export interface Alignment {
  scaleX: number;
  scaleY: number;
  dx: number;
  dy: number;
  score: number;
}

interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

const REGION_MARGIN = 40; // px around the glyph bounds, so the box edges join the match

async function gradient(input: Sharp, width: number, height: number): Promise<Gray> {
  const raw = await input.resize(width, height, { fit: "fill" }).greyscale().raw().toBuffer();
  const data = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = raw[i + 1] - raw[i - 1];
      const gy = raw[i + width] - raw[i - width];
      data[i] = Math.hypot(gx, gy);
    }
  }
  return { data, width, height };
}

async function maskBounds(maskPath: string): Promise<{ x0: number; y0: number; x1: number; y1: number }> {
  const { data, info } = await sharp(maskPath).greyscale().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < 128) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return { x0: Math.max(0, x0 - REGION_MARGIN), y0: Math.max(0, y0 - REGION_MARGIN), x1: x1 + REGION_MARGIN, y1: y1 + REGION_MARGIN };
}

/** NCC of the template region (in template coords) against the target shifted by (dx, dy). */
function ncc(template: Gray, target: Gray, region: { x0: number; y0: number; x1: number; y1: number }, dx: number, dy: number, stride: number): number {
  let n = 0, st = 0, si = 0, stt = 0, sii = 0, sti = 0;
  for (let y = region.y0; y < region.y1; y += stride) {
    const ty = y + dy;
    if (y < 0 || y >= template.height || ty < 0 || ty >= target.height) continue;
    for (let x = region.x0; x < region.x1; x += stride) {
      const tx = x + dx;
      if (x < 0 || x >= template.width || tx < 0 || tx >= target.width) continue;
      const a = template.data[y * template.width + x];
      const b = target.data[ty * target.width + tx];
      n++; st += a; si += b; stt += a * a; sii += b * b; sti += a * b;
    }
  }
  if (n === 0) return -1;
  const cov = sti - (st * si) / n;
  const varA = stt - (st * st) / n;
  const varB = sii - (si * si) / n;
  return varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : -1;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GREEN_MARGIN = 10; // g must beat r by this much to count as box green
const COLUMN_FILL = 0.35; // a column belongs to the box when this share of its rows is green

/** Bounding box of the green pack: columns from a projection, top from the first well-filled row, height from the packshot aspect. */
async function detectBox(imagePath: string, aspect?: number): Promise<Box> {
  const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const green = (x: number, y: number): boolean => {
    const i = (y * width + x) * 3;
    return data[i + 1] - data[i] > GREEN_MARGIN && data[i + 1] >= data[i + 2];
  };
  const columns = Array.from({ length: width }, (_, x) => {
    let n = 0;
    for (let y = 0; y < height; y++) if (green(x, y)) n++;
    return n;
  });
  const peak = Math.max(...columns);
  const x0 = columns.findIndex((n) => n > peak * COLUMN_FILL);
  const x1 = width - 1 - [...columns].reverse().findIndex((n) => n > peak * COLUMN_FILL);
  const boxWidth = x1 - x0 + 1;
  let y0 = 0;
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (green(x, y)) n++;
    if (n > boxWidth * 0.6) { y0 = y; break; }
  }
  let y1 = height - 1;
  if (!aspect) {
    for (let y = height - 1; y > y0; y--) {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (green(x, y)) n++;
      if (n > boxWidth * 0.6) { y1 = y; break; }
    }
  }
  return { x: x0, y: y0, width: boxWidth, height: aspect ? Math.round(boxWidth * aspect) : y1 - y0 + 1 };
}

const SHIFT_RADIUS = 16;
const ASPECT_SPAN = { min: 0.85, max: 1.1 }; // scaleY / scaleX: edits can squash the box
const SCALE_STEP = 0.004;
const REFINE_ROUNDS = 3;

type Scorer = (scaleX: number, scaleY: number, dx: number, dy: number) => Promise<number>;

function makeScorer(packshotPath: string, size: { width: number; height: number }, target: Gray, region: { x0: number; y0: number; x1: number; y1: number }): Scorer {
  const cache = new Map<string, Gray>();
  return async (scaleX, scaleY, dx, dy) => {
    const width = Math.round(size.width * scaleX);
    const height = Math.round(size.height * scaleY);
    const key = `${width}x${height}`;
    let template = cache.get(key);
    if (!template) {
      template = await gradient(sharp(packshotPath), width, height);
      cache.set(key, template);
    }
    const r = { x0: Math.floor(region.x0 * scaleX), y0: Math.floor(region.y0 * scaleY), x1: Math.ceil(region.x1 * scaleX), y1: Math.ceil(region.y1 * scaleY) };
    return ncc(template, target, r, dx, dy, 2);
  };
}

async function bestShift(score: Scorer, a: Alignment, radius: number): Promise<Alignment> {
  let best = a;
  for (let dy = a.dy - radius; dy <= a.dy + radius; dy++) {
    for (let dx = a.dx - radius; dx <= a.dx + radius; dx++) {
      const value = await score(a.scaleX, a.scaleY, dx, dy);
      if (value > best.score) best = { ...a, dx, dy, score: value };
    }
  }
  return best;
}

export async function alignPackshot(packshotPath: string, editedPath: string, maskPath: string): Promise<Alignment> {
  const source = await sharp(packshotPath).metadata();
  const edited = await sharp(editedPath).metadata();
  const size = { width: source.width as number, height: source.height as number };
  const region = await maskBounds(maskPath);

  // The edit model may reframe the shot, so start from the detected box, not from identity.
  const sourceBox = await detectBox(packshotPath);
  const editedBox = await detectBox(editedPath, sourceBox.height / sourceBox.width);
  const guess = editedBox.width / sourceBox.width;
  const target = await gradient(sharp(editedPath), edited.width as number, edited.height as number);
  const score = makeScorer(packshotPath, size, target, region);

  let best = await bestShift(score, { scaleX: guess, scaleY: guess, dx: Math.round(editedBox.x - sourceBox.x * guess), dy: Math.round(editedBox.y - sourceBox.y * guess), score: -1 }, SHIFT_RADIUS);
  // Coordinate descent: sweep each scale with the other fixed, re-centering the shift as we go.
  for (let round = 0; round < REFINE_ROUNDS; round++) {
    for (let scaleY = best.scaleX * ASPECT_SPAN.min; scaleY <= best.scaleX * ASPECT_SPAN.max; scaleY += SCALE_STEP) {
      const candidate = await bestShift(score, { ...best, scaleY, score: -1 }, 3);
      if (candidate.score > best.score) best = candidate;
    }
    for (let scaleX = best.scaleX * 0.97; scaleX <= best.scaleX * 1.03; scaleX += SCALE_STEP) {
      const candidate = await bestShift(score, { ...best, scaleX, score: -1 }, 3);
      if (candidate.score > best.score) best = candidate;
    }
    best = await bestShift(score, best, 4);
  }
  return best;
}

/** Scale the packshot and its glyph mask by the alignment, then composite only the glyphs onto the edit. */
export async function pasteGlyphs(packshotPath: string, editedPath: string, maskPath: string, align: Alignment, outputPath: string): Promise<void> {
  const source = await sharp(packshotPath).metadata();
  const edited = await sharp(editedPath).metadata();
  const width = Math.round((source.width as number) * align.scaleX);
  const height = Math.round((source.height as number) * align.scaleY);
  const canvas = { width: edited.width as number, height: edited.height as number };

  const place = async (input: Sharp, channels: 1 | 3): Promise<Buffer> => {
    const scaled = await input.resize(width, height, { fit: "fill" }).raw().toBuffer();
    const out = Buffer.alloc(canvas.width * canvas.height * channels);
    for (let y = 0; y < height; y++) {
      const ty = y + align.dy;
      if (ty < 0 || ty >= canvas.height) continue;
      for (let x = 0; x < width; x++) {
        const tx = x + align.dx;
        if (tx < 0 || tx >= canvas.width) continue;
        for (let c = 0; c < channels; c++) out[(ty * canvas.width + tx) * channels + c] = scaled[(y * width + x) * channels + c];
      }
    }
    return out;
  };

  const glyphs = await place(sharp(packshotPath).removeAlpha().toColourspace("srgb"), 3);
  const alpha = await place(sharp(maskPath).greyscale().blur(0.8), 1);
  const rgba = Buffer.alloc(canvas.width * canvas.height * 4);
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    rgba[i * 4] = glyphs[i * 3];
    rgba[i * 4 + 1] = glyphs[i * 3 + 1];
    rgba[i * 4 + 2] = glyphs[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  const overlay = await sharp(rgba, { raw: { ...canvas, channels: 4 } }).png().toBuffer();
  await sharp(editedPath).removeAlpha().composite([{ input: overlay }]).png().toFile(outputPath);
}
