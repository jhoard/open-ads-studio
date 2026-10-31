import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { silhouetteBox } from "./align-silhouette";

async function cutout(width: number, height: number, body: { x: number; y: number; w: number; h: number }, speck?: { x: number; y: number }): Promise<string> {
  const alpha = Buffer.alloc(width * height);
  for (let y = body.y; y < body.y + body.h; y++) for (let x = body.x; x < body.x + body.w; x++) alpha[y * width + x] = 255;
  if (speck) alpha[speck.y * width + speck.x] = 255;
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "oas-sil-")), "cutout.png");
  await sharp({ create: { width, height, channels: 3, background: "#808080" } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toFile(file);
  return file;
}

test("silhouetteBox finds the product body and ignores a stray speck", async () => {
  const file = await cutout(200, 300, { x: 50, y: 40, w: 80, h: 200 }, { x: 190, y: 5 });
  assert.deepEqual(await silhouetteBox(file), { x: 50, y: 40, width: 80, height: 200 });
});

test("silhouetteBox refuses an empty cutout", async () => {
  const file = await cutout(200, 300, { x: 0, y: 0, w: 0, h: 0 });
  await assert.rejects(silhouetteBox(file), /no product/);
});
