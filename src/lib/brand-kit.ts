// Brand kit helpers shared by the browser and the server: theme picking, the scene-direction
// rule, and DESIGN.md import and export. Pure functions, no I/O.
import type { Brand, PaletteColor, SceneDirection } from "@/lib/types";

export type KitSource = "empty" | "cached" | "crawl" | "import";

export interface BrandKit extends Brand {
  logoUrl: string;
  /** "mask": a one-color mark recolored with the accent. "image": a crawled logo shown as is. */
  logoKind: "mask" | "image";
  heroImages: string[];
  theme: { surface: string; accent: string };
  source: KitSource;
  /** The DESIGN.md this kit came from; edits are appended on download. */
  designMd: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The same bounded, plain-data brand snapshot is accepted by runs and saved with their outputs. */
export function readBrand(value: unknown): Brand {
  if (!value || typeof value !== "object") throw new Error("Import your brand first.");
  const input = value as Record<string, unknown>;
  const text = (value: unknown, max: number, required = false): string => {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("The brand kit has missing or invalid fields. Review it in Brand.");
    return value.trim();
  };
  if (!Array.isArray(input.palette) || input.palette.length > 6 || !Array.isArray(input.sceneDirections) || input.sceneDirections.length === 0 || input.sceneDirections.length > 8) throw new Error("The brand kit needs at least one scene direction and at most six colors.");
  const typography = input.typography as Record<string, unknown> | null;
  if (!typography) throw new Error("Review the brand typography.");
  return {
    id: text(input.id, 100, true), name: text(input.name, 100, true),
    website: safeWebUrl(text(input.website, 1000)), logo: input.logo === "logo.svg" && input.id === "tauvel" ? "logo.svg" : safeWebUrl(text(input.logo, 1000)),
    tagline: text(input.tagline, 140), tone: text(input.tone, 2000), audience: text(input.audience, 2000),
    palette: input.palette.map((entry) => {
      if (!entry || typeof entry !== "object" || !HEX.test(entry.hex)) throw new Error("Use six-digit hex colors in the brand palette.");
      return { token: text(entry.token, 80, true), hex: entry.hex.toLowerCase(), use: text(entry.use, 200) };
    }),
    typography: { display: text(typography.display, 300), supporting: text(typography.supporting, 300) },
    sceneDirections: input.sceneDirections.map((entry) => {
      if (!entry || typeof entry !== "object" || !/^[a-z0-9-]{1,100}$/.test(entry.id)) throw new Error("Invalid scene direction.");
      return { id: entry.id, label: text(entry.label, 100, true), surface: text(entry.surface, 1000, true), props: text(entry.props, 1000), light: text(entry.light, 1000, true) };
    }),
  };
}

export function safeWebUrl(value: string): string {
  try {
    const url = new URL(value);
    return /^(https?:)$/.test(url.protocol) && !url.username && !url.password ? url.toString() : "";
  } catch { return ""; }
}

export function emptyKit(catalog: SceneDirection[]): BrandKit {
  return { id: "new-brand", name: "Your brand", website: "", tagline: "", logo: "", logoUrl: "", logoKind: "image", palette: [], typography: { display: "Not specified", supporting: "Not specified" }, tone: "", audience: "", sceneDirections: directionsFor(deriveDirectionIds([]), catalog), heroImages: [], theme: pickTheme([]), source: "empty", designMd: "" };
}

/** A browser refresh restores the editable kit without relying on a server's local disk. */
export function restoreKit(value: unknown): BrandKit {
  const brand = readBrand(value);
  const input = value as BrandKit;
  if (!["cached", "crawl", "import"].includes(input.source)) throw new Error("Invalid brand source.");
  return { ...brand, source: input.source, logoUrl: safeWebUrl(input.logoUrl ?? "") || (input.source === "cached" ? "/api/assets/logo.svg" : ""), logoKind: input.source === "cached" ? "mask" : "image", heroImages: Array.isArray(input.heroImages) ? input.heroImages.filter((url) => typeof url === "string").map(safeWebUrl).filter(Boolean).slice(0, 4) : [], theme: pickTheme(brand.palette.map((entry) => entry.hex)), designMd: typeof input.designMd === "string" ? input.designMd.slice(0, 512 * 1024) : "" };
}
const DARK_LUMA = 0.35;
const DARK_DOMINANT_SHARE = 0.5;

export function luma(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function saturation(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const max = Math.max(...channels);
  return max === 0 ? 0 : (max - Math.min(...channels)) / max;
}

const CANVAS = "#0f0f0e";
const SURFACE_SHARE = 0.3; // a light brand color keeps this much of itself when darkened into a panel

/** Mix toward the canvas, so cream text stays readable on a panel made from a light brand color. */
export function darken(hex: string, keep: number = SURFACE_SHARE): string {
  const channel = (value: string, at: number): number => Number.parseInt(value.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) => Math.round(channel(hex, at) * keep + channel(CANVAS, at) * (1 - keep)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** Surface: the darkest color with some hue (else the darkest, darkened if light). Accent: the most saturated mid-tone. */
export function pickTheme(hexes: string[]): { surface: string; accent: string } {
  const colors = hexes.filter((hex) => HEX.test(hex));
  if (colors.length === 0) return { surface: "#181816", accent: "#cfc6ba" };
  const byLuma = [...colors].sort((a, b) => luma(a) - luma(b));
  const surface = byLuma.find((hex) => luma(hex) < DARK_LUMA && saturation(hex) > 0.15) ?? byLuma[0];
  const mids = colors.filter((hex) => hex !== surface && luma(hex) > DARK_LUMA && luma(hex) < 0.85);
  const accent = [...(mids.length ? mids : colors.filter((hex) => hex !== surface))].sort((a, b) => saturation(b) - saturation(a))[0] ?? byLuma[byLuma.length - 1];
  return { surface: luma(surface) < DARK_LUMA ? surface : darken(surface), accent };
}

/** Dark-dominant brands get the dark sets; light-dominant ones get linen and travertine. */
export function deriveDirectionIds(weighted: { color: string; weight: number }[]): string[] {
  const usable = weighted.filter((entry) => HEX.test(entry.color) && entry.weight > 0);
  const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
  const dark = usable.filter((entry) => luma(entry.color) < DARK_LUMA).reduce((sum, entry) => sum + entry.weight, 0);
  const darkDominant = total > 0 && dark / total >= DARK_DOMINANT_SHARE;
  return darkDominant ? ["slate-beam", "dark-stone-evening"] : ["linen-ritual", "travertine-morning"];
}

export function directionsFor(ids: string[], catalog: SceneDirection[]): SceneDirection[] {
  return ids.map((id) => catalog.find((direction) => direction.id === id)).filter((direction): direction is SceneDirection => Boolean(direction));
}

/** Sample styling is reusable; coffee and chocolate props belong only to the sample brand. */
export function neutralDirections(catalog: SceneDirection[]): SceneDirection[] {
  return catalog.map((direction) => ({ ...direction, surface: direction.surface.replace("espresso-toned", "neutral-toned"), props: "no additional props; keep the focus on the product" }));
}

// DESIGN.md: the sections Open Ads Studio appends, so an exported file imports back losslessly.
const VOICE_HEADING = "## Brand voice (Open Ads Studio)";
const DIRECTIONS_HEADING = "## Scene directions (Open Ads Studio)";

/** Export the current kit rather than stale values from its original imported file. */
export function toDesignMd(kit: BrandKit): string {
  const base = `# DESIGN.md: ${kit.name}`;
  const palette = ["", "## Palette", ...kit.palette.map((color) => `- ${color.token}: ${color.hex}`)];
  const voice = ["", "---", VOICE_HEADING, `- Name: ${kit.name}`, `- Website: ${kit.website}`, `- Logo: ${kit.logoUrl}`, `- Display font: ${kit.typography.display}`, `- Body font: ${kit.typography.supporting}`, `- Tagline: ${kit.tagline}`, `- Tone: ${kit.tone}`, `- Audience: ${kit.audience}`];
  const directions = ["", DIRECTIONS_HEADING, ...kit.sceneDirections.map((direction) => `- ${direction.label} (${direction.id}): ${direction.surface}; ${direction.props}; ${direction.light}`)];
  // The brand-data snapshot preserves multiline fields and custom directions exactly on reimport.
  return [base, ...palette, ...voice, ...directions, "", "## Brand data (Open Ads Studio)", "```json", JSON.stringify(readBrand(kit), null, 2), "```", ""].join("\n");
}

export interface ParsedDesignMd {
  name: string | null;
  palette: string[];
  fonts: string[];
  tagline: string | null;
  tone: string | null;
  audience: string | null;
  directionIds: string[];
  website: string | null;
  logoUrl: string | null;
}

function field(markdown: string, label: string): string | null {
  const match = new RegExp(`^(?:[-*]\\s+)?(?:\\*\\*)?(?:${label})(?:\\*\\*)?\\s*:(?:\\*\\*)?\\s*(.+)$`, "im").exec(markdown);
  return match ? match[1].replace(/^[`*]+|[`*]+$/g, "").trim() : null;
}

/** Reads an Extractor DESIGN.md, or one this app exported. Unknown sections are ignored. */
export function parseDesignMd(markdown: string): ParsedDesignMd {
  markdown = markdown.replace(/\r\n?/g, "\n");
  const title = /^#\s+(?:DESIGN\.md:\s*)?(.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
  const voiceStart = markdown.indexOf(VOICE_HEADING);
  const voice = voiceStart === -1 ? markdown : markdown.slice(voiceStart);
  const body = voiceStart === -1 ? markdown : markdown.slice(0, voiceStart);
  const palette = [...new Set([...body.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((match) => match[0].length === 4 ? `#${[...match[0].slice(1)].map((c) => c + c).join("")}`.toLowerCase() : match[0].toLowerCase()))];
  const fontSection = /#{2,3}\s+(?:Typography|Font Families)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i.exec(body)?.[1] ?? "";
  const fonts = [...new Set([field(voice, "Display font|Heading font|Display|Headings|Font"), field(voice, "Body font|Supporting font|Body"), ...[...fontSection.matchAll(/^\|\s*\*\*([^*]+)\*\*\s*\|/gm)].map((match) => match[1].trim())].filter((font): font is string => Boolean(font)))];
  const directionIds = [...voice.matchAll(/^- .+? \(([a-z0-9-]+)\):/gm)].map((match) => match[1]);
  return {
    name: field(voice, "Name|Brand name|Brand") ?? title?.split(/[:|]/)[0].trim() ?? null,
    palette,
    fonts,
    tagline: field(voice, "Tagline"),
    tone: field(voice, "Tone|Tone of voice|Brand voice") ?? sectionText(markdown, "Tone|Tone of voice|Brand voice"),
    audience: field(voice, "Audience|Target audience") ?? sectionText(markdown, "Audience|Target audience"),
    directionIds,
    website: field(voice, "Website|URL") ?? /Extracted from \[([^\]]+)\]/.exec(markdown)?.[1] ?? null,
    logoUrl: field(voice, "Logo|Logo URL") ?? /!\[(?:[^\]]*logo[^\]]*)\]\((https?:[^)]+)\)/i.exec(markdown)?.[1] ?? null,
  };
}

function sectionText(markdown: string, heading: string): string | null {
  return new RegExp(`^#{2,3}\\s+(?:${heading})\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, "im").exec(markdown)?.[1]?.trim() || null;
}

/** Palette tokens for colors that arrive without names. */
export function namePalette(hexes: string[]): PaletteColor[] {
  return hexes.map((hex, index) => ({ token: `${luma(hex) < DARK_LUMA ? "dark" : luma(hex) > 0.8 ? "light" : "mid"}-${index + 1}`, hex, use: "extracted" }));
}

/** A kit from an imported DESIGN.md: its palette and fonts, plus any voice and directions this app exported. */
export function kitFromDesignMd(markdown: string, catalog: SceneDirection[]): BrandKit {
  catalog = neutralDirections(catalog);
  if (!markdown.trim() || markdown.includes("\0")) throw new Error("Choose a readable Markdown brand file.");
  const snapshot = /## Brand data \(Open Ads Studio\)\s*```json\s*([\s\S]*?)```/.exec(markdown)?.[1];
  if (snapshot) {
    const brand = readBrand(JSON.parse(snapshot));
    return { ...brand, logoUrl: safeWebUrl(brand.logo), logoKind: "image", heroImages: [], theme: pickTheme(brand.palette.map((color) => color.hex)), source: "import", designMd: markdown };
  }
  const parsed = parseDesignMd(markdown);
  if (!parsed.name || (!parsed.palette.length && !parsed.fonts.length && !parsed.tone && !parsed.audience && !parsed.website)) throw new Error("No brand details found. Include a brand name plus colors, fonts, tone, audience or website.");
  const name = parsed.name ?? "Imported brand";
  const ids = parsed.directionIds.length ? parsed.directionIds : deriveDirectionIds(parsed.palette.map((color) => ({ color, weight: 1 })));
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "imported-brand",
    name,
    website: safeWebUrl(parsed.website ?? ""),
    tagline: parsed.tagline ?? "",
    logo: safeWebUrl(parsed.logoUrl ?? ""),
    logoUrl: safeWebUrl(parsed.logoUrl ?? ""),
    logoKind: "image",
    palette: namePalette(parsed.palette.slice(0, 6)),
    typography: { display: parsed.fonts[0] ?? "Not specified", supporting: parsed.fonts[1] ?? parsed.fonts[0] ?? "Not specified" },
    tone: parsed.tone ?? "",
    audience: parsed.audience ?? "",
    sceneDirections: directionsFor(ids, catalog).length ? directionsFor(ids, catalog) : catalog.slice(0, 1),
    heroImages: [],
    theme: pickTheme(parsed.palette),
    source: "import",
    designMd: markdown,
  };
}
