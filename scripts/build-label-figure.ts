// README figure: the model-alone Scene render next to the restored one, each with a label close-up.
// Usage: npx tsx scripts/build-label-figure.ts
import sharp from "sharp";
import { DIRECTION_EXAMPLES } from "../src/lib/directions";
import { textBlock } from "../src/lib/server/text-paths";

const DIRECTION = "slate-beam";
const OUT = "docs/img/label-before-after.png";
const FULL_WIDTH = 560;
const FULL_HEIGHT = 700;
const CROP = { left: 340, top: 300, width: 420, height: 900 }; // the box in the 1120x1400 render, padded
const CROP_HEIGHT = FULL_HEIGHT;
const CROP_WIDTH = Math.round((CROP.width / CROP.height) * CROP_HEIGHT);
const GAP = 16;
const MARGIN = 32;
const CAPTION = 72;
const BACKGROUND = "#0f0f0e";
const INK = "#ece9e2";
const MUTED = "#a8a49b";

async function column(file: string): Promise<sharp.OverlayOptions[]> {
  const full = await sharp(file).resize(FULL_WIDTH, FULL_HEIGHT).png().toBuffer();
  const crop = await sharp(file).extract(CROP).resize(CROP_WIDTH, CROP_HEIGHT).png().toBuffer();
  return [{ input: full }, { input: crop }];
}

function caption(title: string, detail: string, x: number, width: number): string {
  const head = textBlock(title, { x, y: MARGIN, width }, { font: "label", size: 26 });
  const sub = textBlock(detail, { x, y: MARGIN + 36, width }, { font: "label", size: 18 });
  return `<path d="${head.d}" fill="${INK}"/><path d="${sub.d}" fill="${MUTED}"/>`;
}

async function main(): Promise<void> {
  const example = DIRECTION_EXAMPLES[DIRECTION];
  if (!example) throw new Error(`No bundled example for ${DIRECTION}`);
  const colWidth = FULL_WIDTH + GAP + CROP_WIDTH;
  const width = MARGIN * 2 + colWidth * 2 + MARGIN;
  const height = MARGIN + CAPTION + FULL_HEIGHT + MARGIN;
  const percent = (value: number): string => `${(Math.floor(value * 1000) / 10).toFixed(1)}%`;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + MARGIN;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${caption(
    "Model alone (Qwen-Image-Edit 2509)",
    `Label match ${percent(example.modelLabelMatch ?? 0)}: the model repaints the gold glyphs`,
    leftX,
    colWidth,
  )}${caption("Restored by Open Ads Studio", `Label match ${percent(example.labelMatch ?? 0)}: original glyphs pasted back, tone-matched`, rightX, colWidth)}</svg>`;
  const top = MARGIN + CAPTION;
  const [rawFull, rawCrop] = await column(`public${example.rawUrl ?? ""}`);
  const [finalFull, finalCrop] = await column(`public${example.url}`);
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite([
      { input: Buffer.from(svg), left: 0, top: 0 },
      { ...rawFull, left: leftX, top },
      { ...rawCrop, left: leftX + FULL_WIDTH + GAP, top },
      { ...finalFull, left: rightX, top },
      { ...finalCrop, left: rightX + FULL_WIDTH + GAP, top },
    ])
    .png()
    .toFile(OUT);
  process.stdout.write(`Wrote ${OUT} (${width}x${height})\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
