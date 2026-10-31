import sharp from "sharp";
import { refineAlignment, type Alignment, type Box } from "./glyph-paste";

// Generic product placement for uploads: no color assumptions. BiRefNet cuts the product out of the
// packshot and out of the render; the two silhouettes' boxes give scale and shift, and the label-region
// gradient match refines it, as for Tauvel.

const ALPHA_ON = 128;
const FILL_SHARE = 0.25; // a row or column belongs to the product when this share of the peak is opaque
const MIN_PRODUCT_SHARE = 0.01; // a silhouette smaller than this share of the image is treated as a failed cutout

/** Bounding box of an alpha mask's main body, from row and column projections so stray specks do not widen it. */
export async function silhouetteBox(cutoutPath: string): Promise<Box> {
  const { data, info } = await sharp(cutoutPath).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const columns = new Array<number>(width).fill(0);
  const rows = new Array<number>(height).fill(0);
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < ALPHA_ON) continue;
      columns[x]++;
      rows[y]++;
      total++;
    }
  }
  if (total < width * height * MIN_PRODUCT_SHARE) throw new Error("The cutout found no product in this image.");
  const span = (values: number[]): [number, number] => {
    const threshold = Math.max(...values) * FILL_SHARE;
    const first = values.findIndex((value) => value >= threshold);
    const last = values.length - 1 - [...values].reverse().findIndex((value) => value >= threshold);
    return [first, last];
  };
  const [x0, x1] = span(columns);
  const [y0, y1] = span(rows);
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Scale and shift that carry the packshot silhouette onto the render's, refined on the label. */
export async function alignBySilhouette(packshotPath: string, packshotCutout: string, renderPath: string, renderCutout: string, maskPath: string): Promise<Alignment> {
  const [source, target] = await Promise.all([silhouetteBox(packshotCutout), silhouetteBox(renderCutout)]);
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  const seed = { scaleX, scaleY, dx: target.x - source.x * scaleX, dy: target.y - source.y * scaleY, score: -1 };
  return refineAlignment(packshotPath, renderPath, maskPath, seed);
}
