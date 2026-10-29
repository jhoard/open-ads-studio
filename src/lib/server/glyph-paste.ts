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

interface Canvas {
  width: number;
  height: number;
}

// Tone match: glyphs scale by the ratio of box-face luminance (edit vs packshot), smoothed so the beam's falloff carries across the label.
const TONE_SIGMA = 24;
const TONE_RANGE = { min: 0.35, max: 1.4 };
const FACE_GLYPH_GUARD = 12; // px kept clear of glyph edges when sampling face luminance
// The paste covers a band past the glyphs so a slightly misregistered model copy can't peek out.
const PASTE_BAND = 6;
const PASTE_FEATHER = 1.5;
// Reflection: flipped glyphs under the base, fading out, over a softened strip that erases the model's invented mirror text.
const REFLECTION_OPACITY = 0.25;
const REFLECTION_DEPTH_SHARE = 0.18; // of the placed box height: just past the mirrored small text
const REFLECTION_SOFTEN_SIGMA = 7;
const STRIP_FEATHER = 24; // px of horizontal blend into the untouched surface
const STRIP_HOLD_SHARE = 0.6; // full softening for this share of the strip depth, then blend out

const luma = (rgb: Buffer, i: number): number => 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];

/** Resize a source image by the alignment and drop it onto a canvas-sized raw buffer. */
async function placeOnCanvas(input: Sharp, align: Alignment, size: Canvas, canvas: Canvas, channels: 1 | 3): Promise<Buffer> {
  const width = Math.round(size.width * align.scaleX);
  const height = Math.round(size.height * align.scaleY);
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
}

const blurGray = (data: Buffer, canvas: Canvas, sigma: number): Promise<Buffer> =>
  sharp(data, { raw: { ...canvas, channels: 1 } }).blur(sigma).raw().toBuffer();

/** Per-pixel brightness ratio of the edit's box face to the packshot's, from glyph-free face pixels only. */
async function toneRatio(edited: Buffer, packshot: Buffer, face: Buffer, canvas: Canvas): Promise<Float32Array> {
  const n = canvas.width * canvas.height;
  const editedFace = Buffer.alloc(n);
  const packshotFace = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    if (!face[i]) continue;
    editedFace[i] = Math.round(luma(edited, i));
    packshotFace[i] = Math.max(1, Math.round(luma(packshot, i)));
  }
  // Same weights on both sides, so the ratio of the blurs is a normalized local ratio.
  const [e, p] = await Promise.all([blurGray(editedFace, canvas, TONE_SIGMA), blurGray(packshotFace, canvas, TONE_SIGMA)]);
  const ratio = new Float32Array(n);
  for (let i = 0; i < n; i++) ratio[i] = p[i] > 0 ? Math.min(TONE_RANGE.max, Math.max(TONE_RANGE.min, e[i] / p[i])) : 1;
  return ratio;
}

/** Composite the aligned, tone-matched glyphs onto the edit, plus their fading reflection under the base. */
export async function pasteGlyphs(packshotPath: string, editedPath: string, maskPath: string, align: Alignment, outputPath: string): Promise<void> {
  const meta = await sharp(packshotPath).metadata();
  const size = { width: meta.width as number, height: meta.height as number };
  const { data: edited, info } = await sharp(editedPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const canvas = { width: info.width, height: info.height };
  const n = canvas.width * canvas.height;

  const sourceBox = await detectBox(packshotPath);
  const box = {
    x0: Math.max(0, Math.round(align.dx + sourceBox.x * align.scaleX)),
    x1: Math.min(canvas.width - 1, Math.round(align.dx + (sourceBox.x + sourceBox.width) * align.scaleX)),
    y0: Math.max(0, Math.round(align.dy + sourceBox.y * align.scaleY)),
    base: Math.min(canvas.height - 1, Math.round(align.dy + (sourceBox.y + sourceBox.height) * align.scaleY)),
  };
  const [glyphs, alpha, guard] = await Promise.all([
    placeOnCanvas(sharp(packshotPath).removeAlpha().toColourspace("srgb"), align, size, canvas, 3),
    placeOnCanvas(sharp(maskPath).greyscale().dilate(PASTE_BAND).blur(PASTE_FEATHER), align, size, canvas, 1),
    placeOnCanvas(sharp(maskPath).greyscale().dilate(FACE_GLYPH_GUARD), align, size, canvas, 1),
  ]);

  const face = Buffer.alloc(n);
  for (let y = box.y0; y < box.base; y++) for (let x = box.x0; x <= box.x1; x++) face[y * canvas.width + x] = guard[y * canvas.width + x] < 16 ? 1 : 0;
  const ratio = await toneRatio(edited, glyphs, face, canvas);

  // Soften the reflection strip first so the model's own mirrored text disappears.
  const depth = Math.round((box.base - box.y0) * REFLECTION_DEPTH_SHARE);
  const strip = { left: box.x0, top: box.base + 1, width: box.x1 - box.x0 + 1, height: Math.max(0, Math.min(depth, canvas.height - box.base - 1)) };
  const out = Buffer.from(edited);
  if (strip.height > 0) {
    const soft = await sharp(edited, { raw: { ...canvas, channels: 3 } }).blur(REFLECTION_SOFTEN_SIGMA).raw().toBuffer();
    const smooth = (t: number): number => t * t * (3 - 2 * t);
    for (let y = strip.top; y < strip.top + strip.height; y++) {
      const depthShare = (y - strip.top) / strip.height;
      const vertical = depthShare < STRIP_HOLD_SHARE ? 1 : smooth(1 - (depthShare - STRIP_HOLD_SHARE) / (1 - STRIP_HOLD_SHARE));
      for (let x = strip.left; x < strip.left + strip.width; x++) {
        const edge = Math.min(x - strip.left, strip.left + strip.width - 1 - x);
        const w = vertical * smooth(Math.min(1, edge / STRIP_FEATHER));
        const i = (y * canvas.width + x) * 3;
        for (let c = 0; c < 3; c++) out[i + c] = Math.round(out[i + c] * (1 - w) + soft[i + c] * w);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (!alpha[i]) continue;
    const a = alpha[i] / 255;
    const k = ratio[i];
    const y = Math.floor(i / canvas.width);
    const x = i - y * canvas.width;
    for (let c = 0; c < 3; c++) {
      const toned = Math.min(255, glyphs[i * 3 + c] * k);
      out[i * 3 + c] = Math.round(out[i * 3 + c] * (1 - a) + toned * a);
    }
    // Mirror about the base line, fading to zero at the strip's far edge.
    const my = 2 * box.base - y;
    const distance = my - box.base;
    if (distance <= 0 || distance > strip.height) continue;
    const ra = a * REFLECTION_OPACITY * (1 - distance / strip.height);
    const j = (my * canvas.width + x) * 3;
    for (let c = 0; c < 3; c++) {
      const toned = Math.min(255, glyphs[i * 3 + c] * k);
      out[j + c] = Math.round(out[j + c] * (1 - ra) + toned * ra);
    }
  }
  await sharp(out, { raw: { ...canvas, channels: 3 } }).png().toFile(outputPath);
}
