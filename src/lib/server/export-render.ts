import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { exportLayout, type Box, type ExportLayout, type ExportSize } from "@/lib/export-layout";
import type { Brand } from "@/lib/types";
import { textBlock } from "./text-paths";

// Deterministic export renders: the creative cover-fitted into an ad layout, the copy line,
// the logo, and the AI-disclosure badge. No model runs here.

const run = promisify(execFile);
const END_CARD_SECONDS = 1.5;
const BADGE_TEXT = "AI-GENERATED";

export interface Disclosure {
  models: string[];
  basis: string[];
  provenanceRef: string;
}

interface Palette {
  ground: string;
  ink: string;
  accent: string;
  card: string;
}

function palette(brand: Brand): Palette {
  const hex = (token: string, fallback: string): string => brand.palette.find((color) => color.token === token)?.hex ?? fallback;
  return { ground: hex("espresso", "#2B1A12"), ink: hex("cream", "#F2EADF"), accent: hex("brushed-gold", "#B8925A"), card: hex("bottle-green", "#1F3A2E") };
}

/** The single-source logo, recolored and placed: its paths use currentColor. */
async function logoSvg(brand: Brand, box: Box, color: string): Promise<string> {
  const source = await readFile(path.join(process.cwd(), "assets", "tauvel", path.basename(brand.logo)), "utf8");
  return source
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<svg\b([^>]*)>/, (_match, attributes: string) => {
      const viewBox = /viewBox="([^"]+)"/.exec(attributes)?.[1] ?? "0 0 503 296";
      return `<svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" viewBox="${viewBox}" color="${color}" fill="none">`;
    });
}

function badgeSvg(box: Box): string {
  const label = textBlock(BADGE_TEXT, { x: box.x + 24, y: box.y + 15, width: box.width }, { font: "label", size: 20, letterSpacing: 0.14 });
  const width = Math.round(label.width + 48);
  const x = box.x + box.width - width;
  const shifted = textBlock(BADGE_TEXT, { x: x + 24, y: box.y + 15, width }, { font: "label", size: 20, letterSpacing: 0.14 });
  return `<rect x="${x}" y="${box.y}" width="${width}" height="${box.height}" rx="${box.height / 2}" fill="rgba(12,9,7,0.62)" stroke="rgba(242,234,223,0.35)"/><path d="${shifted.d}" fill="#F2EADF"/>`;
}

const COPY_SIZE: Record<ExportSize, number> = { "9:16": 64, "1:1": 50, "16:9": 72 };

/** Everything above the creative: panel, gradient, copy, logo, badge. Transparent over the media. */
async function overlaySvg(layout: ExportLayout, size: ExportSize, brand: Brand, copy: string): Promise<string> {
  const colors = palette(brand);
  const center = size === "9:16";
  const text = textBlock(copy, layout.copy, { font: "display", size: COPY_SIZE[size], lineHeight: 1.18, align: center ? "center" : "left" });
  const panel = layout.panel ? `<rect x="${layout.panel.x}" y="${layout.panel.y}" width="${layout.panel.width}" height="${layout.panel.height}" fill="${colors.ground}"/>` : "";
  const gradient = layout.panel
    ? ""
    : `<defs><linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></linearGradient></defs><rect x="0" y="${layout.height * 0.62}" width="${layout.width}" height="${layout.height * 0.38}" fill="url(#foot)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">${gradient}${panel}<path d="${text.d}" fill="${colors.ink}"/>${await logoSvg(brand, layout.logo, colors.accent)}${badgeSvg(layout.badge)}</svg>`;
}

async function overlayPng(layout: ExportLayout, size: ExportSize, brand: Brand, copy: string): Promise<Buffer> {
  return sharp(Buffer.from(await overlaySvg(layout, size, brand, copy))).png().toBuffer();
}

function disclosureText(disclosure: Disclosure): string {
  return JSON.stringify({ ai_generated: true, generator: "Open Ads Studio", models: disclosure.models, disclosure_basis: disclosure.basis, provenance: disclosure.provenanceRef });
}

export async function renderStill(sourcePath: string, size: ExportSize, brand: Brand, copy: string, disclosure: Disclosure): Promise<Buffer> {
  const layout = exportLayout(size);
  // The square crop keeps the foot of the frame and lifts the product, so the copy below never reaches the label.
  const position = size === "1:1" ? "south" : "centre";
  const media = await sharp(sourcePath).resize(layout.media.width, layout.media.height, { fit: "cover", position }).toBuffer();
  return sharp({ create: { width: layout.width, height: layout.height, channels: 3, background: palette(brand).ground } })
    .composite([
      { input: media, left: layout.media.x, top: layout.media.y },
      { input: await overlayPng(layout, size, brand, copy), left: 0, top: 0 },
    ])
    .withExif({ IFD0: { Software: "Open Ads Studio", ImageDescription: disclosureText(disclosure), Artist: "AI-generated (open-weight models)" } })
    .png()
    .toBuffer();
}

/** Logo end card: bottle-green ground, gold mark, tagline in the display face. */
async function endCardPng(size: ExportSize, brand: Brand): Promise<Buffer> {
  const layout = exportLayout(size);
  const colors = palette(brand);
  const logoWidth = Math.round(Math.min(layout.width, layout.height) * 0.42);
  const logoHeight = Math.round((logoWidth * 296) / 503);
  const logo = { x: Math.round((layout.width - logoWidth) / 2), y: Math.round(layout.height / 2 - logoHeight * 0.75), width: logoWidth, height: logoHeight };
  const tagline = textBlock(brand.tagline, { x: 0, y: logo.y + logoHeight + 48, width: layout.width }, { font: "display", size: Math.round(logoWidth * 0.11), align: "center" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}"><rect width="100%" height="100%" fill="${colors.card}"/>${await logoSvg(brand, logo, colors.accent)}<path d="${tagline.d}" fill="${colors.ink}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function hasAudio(file: string): Promise<boolean> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]);
  return stdout.trim().length > 0;
}

/** Clip export: the creative in the layout, then the logo end card. Needs ffmpeg on the PATH. */
export async function renderClip(sourcePath: string, size: ExportSize, brand: Brand, copy: string, disclosure: Disclosure, outputPath: string, workDir: string): Promise<void> {
  const layout = exportLayout(size);
  const overlay = path.join(workDir, `overlay-${size.replace(":", "x")}.png`);
  const card = path.join(workDir, `card-${size.replace(":", "x")}.png`);
  await sharp(await overlayPng(layout, size, brand, copy)).toFile(overlay);
  await sharp(await endCardPng(size, brand)).toFile(card);
  const audio = await hasAudio(sourcePath);
  const { media } = layout;
  const ground = palette(brand).ground.replace("#", "0x");
  const video =
    `[0:v]fps=24,scale=${media.width}:${media.height}:force_original_aspect_ratio=increase,crop=${media.width}:${media.height},` +
    `pad=${layout.width}:${layout.height}:${media.x}:${media.y}:color=${ground},format=rgba[base];[base][1:v]overlay=0:0,format=yuv420p,setsar=1[main];` +
    `[2:v]fps=24,format=yuv420p,setsar=1[card]`;
  const audioChain = audio
    ? `;[0:a]aresample=48000,aformat=channel_layouts=stereo[ma];anullsrc=r=48000:cl=stereo,atrim=duration=${END_CARD_SECONDS}[ca];[main][ma][card][ca]concat=n=2:v=1:a=1[v][a]`
    : `;[main][card]concat=n=2:v=1:a=0[v]`;
  await run("ffmpeg", [
    "-loglevel", "error", "-y",
    "-i", sourcePath,
    "-i", overlay,
    "-loop", "1", "-t", String(END_CARD_SECONDS), "-i", card,
    "-filter_complex", video + audioChain,
    "-map", "[v]", ...(audio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
    "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-movflags", "+faststart",
    "-metadata", `comment=${disclosureText(disclosure)}`,
    "-metadata", "description=AI-generated with open-weight models (Open Ads Studio)",
    outputPath,
  ]);
}
