// Label match: how faithfully an image reproduces the source label inside the protected region.
// Uses the structure term of SSIM (local correlation) over small windows, so the brightness and
// contrast change from relighting does not count as damage but a garbled or shifted letter does.

const WINDOW = 8;
const STRIDE = 4;
const MIN_COVERAGE = 0.25; // a window counts when this share of its pixels is protected
const C3 = (0.03 * 255) ** 2 / 2;

export interface LabelPlane {
  /** Luma per pixel, canvas sized. */
  luma: Float32Array;
  width: number;
  height: number;
}

/** Mean structure similarity of two luma planes over the windows the mask covers. 1 is identical. */
export function labelMatch(a: LabelPlane, b: LabelPlane, mask: Uint8Array | Buffer): number {
  const { width, height } = a;
  let total = 0;
  let windows = 0;
  for (let y0 = 0; y0 + WINDOW <= height; y0 += STRIDE) {
    for (let x0 = 0; x0 + WINDOW <= width; x0 += STRIDE) {
      let covered = 0;
      for (let y = y0; y < y0 + WINDOW; y++) for (let x = x0; x < x0 + WINDOW; x++) if (mask[y * width + x] > 127) covered++;
      if (covered < WINDOW * WINDOW * MIN_COVERAGE) continue;

      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let y = y0; y < y0 + WINDOW; y++) {
        for (let x = x0; x < x0 + WINDOW; x++) {
          const i = y * width + x;
          const va = a.luma[i], vb = b.luma[i];
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
      }
      const n = WINDOW * WINDOW;
      const varA = saa / n - (sa / n) ** 2;
      const varB = sbb / n - (sb / n) ** 2;
      const cov = sab / n - (sa / n) * (sb / n);
      total += (cov + C3) / (Math.sqrt(Math.max(0, varA) * Math.max(0, varB)) + C3);
      windows++;
    }
  }
  return windows === 0 ? 0 : total / windows;
}

export function lumaPlane(rgb: Buffer, width: number, height: number): LabelPlane {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) luma[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
  return { luma, width, height };
}
