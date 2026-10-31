import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MASK_BOXES, buildGlyphMask, parseBoxes } from "./glyph-mask";

const W = 40, H = 20;

/** A light label (200) with one dark glyph block (40) at x 10-14, y 6-12, and a dark product edge at x 30+. */
function label(): Float32Array {
  const luma = new Float32Array(W * H).fill(200);
  for (let y = 6; y <= 12; y++) for (let x = 10; x <= 14; x++) luma[y * W + x] = 40;
  for (let y = 0; y < H; y++) for (let x = 30; x < W; x++) luma[y * W + x] = 20;
  return luma;
}

const on = (mask: Uint8Array, x: number, y: number): boolean => mask[y * W + x] === 255;

test("marks glyph pixels that differ from the box's own background, plus a one-pixel edge", () => {
  const mask = buildGlyphMask(label(), null, W, H, [{ x: 0.1, y: 0.1, width: 0.5, height: 0.8 }], 40);
  assert.ok(on(mask, 12, 9), "glyph center");
  assert.ok(on(mask, 9, 9), "anti-aliased edge");
  assert.ok(!on(mask, 7, 9), "background stays clear");
});

test("nothing outside the boxes is protected, even high-contrast pixels", () => {
  const mask = buildGlyphMask(label(), null, W, H, [{ x: 0.1, y: 0.1, width: 0.5, height: 0.8 }], 40);
  assert.ok(!on(mask, 35, 5), "dark edge outside the box");
});

test("a higher threshold drops faint detail; the alpha keeps the mask on the product", () => {
  const luma = label();
  luma[3 * W + 20] = 170; // faint mark, 30 below the background
  const box = [{ x: 0.1, y: 0.1, width: 0.5, height: 0.8 }];
  assert.ok(on(buildGlyphMask(luma, null, W, H, box, 20), 20, 3));
  assert.ok(!on(buildGlyphMask(luma, null, W, H, box, 40), 20, 3));
  const alpha = new Uint8Array(W * H).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < 13; x++) alpha[y * W + x] = 0;
  const masked = buildGlyphMask(luma, alpha, W, H, box, 40);
  assert.ok(!on(masked, 11, 9) && on(masked, 14, 9));
});

test("parseBoxes rejects out-of-range, overflowing and too many boxes", () => {
  assert.deepEqual(parseBoxes([{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }]), [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }]);
  assert.equal(parseBoxes([]), null);
  assert.equal(parseBoxes([{ x: 0.8, y: 0, width: 0.3, height: 0.1 }]), null);
  assert.equal(parseBoxes([{ x: -0.1, y: 0, width: 0.3, height: 0.1 }]), null);
  assert.equal(parseBoxes([{ x: "0", y: 0, width: 0.3, height: 0.1 }]), null);
  assert.equal(parseBoxes(Array.from({ length: MAX_MASK_BOXES + 1 }, () => ({ x: 0, y: 0, width: 0.1, height: 0.1 }))), null);
});
