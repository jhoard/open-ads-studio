// Brand kit helpers shared by the browser and the server: theme picking, the scene-direction
// rule, and DESIGN.md import and export. Pure functions, no I/O.
import type { Brand, PaletteColor, SceneDirection } from "@/lib/types";

export type KitSource = "cached" | "crawl" | "import";

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

// DESIGN.md: the sections Open Ads Studio appends, so an exported file imports back losslessly.
const VOICE_HEADING = "## Brand voice (Open Ads Studio)";
const DIRECTIONS_HEADING = "## Scene directions (Open Ads Studio)";

function stripStudioSections(markdown: string): string {
  const index = markdown.indexOf(VOICE_HEADING);
  return (index === -1 ? markdown : markdown.slice(0, index)).trimEnd();
}

/** The kit's DESIGN.md with the current tagline, tone, audience and scene directions appended. */
export function toDesignMd(kit: BrandKit): string {
  const base = stripStudioSections(kit.designMd) || `# DESIGN.md: ${kit.name}`;
  const palette = kit.designMd.includes("#") ? [] : ["", "## Palette", "| Token | Hex | Use |", "|---|---|---|", ...kit.palette.map((color) => `| ${color.token} | ${color.hex} | ${color.use} |`)];
  const voice = ["", "---", VOICE_HEADING, `- Name: ${kit.name}`, `- Tagline: ${kit.tagline}`, `- Tone: ${kit.tone}`, `- Audience: ${kit.audience}`];
  const directions = ["", DIRECTIONS_HEADING, ...kit.sceneDirections.map((direction) => `- ${direction.label} (${direction.id}): ${direction.surface}; ${direction.props}; ${direction.light}`)];
  return [base, ...palette, ...voice, ...directions, ""].join("\n");
}

export interface ParsedDesignMd {
  name: string | null;
  palette: string[];
  fonts: string[];
  tagline: string | null;
  tone: string | null;
  audience: string | null;
  directionIds: string[];
}

function field(markdown: string, label: string): string | null {
  const match = new RegExp(`^- ${label}: (.+)$`, "m").exec(markdown);
  return match ? match[1].trim() : null;
}

/** Reads an Extractor DESIGN.md, or one this app exported. Unknown sections are ignored. */
export function parseDesignMd(markdown: string): ParsedDesignMd {
  const title = /^#\s+(?:DESIGN\.md:\s*)?(.+)$/m.exec(markdown)?.[1]?.trim() ?? null;
  const voiceStart = markdown.indexOf(VOICE_HEADING);
  const voice = voiceStart === -1 ? "" : markdown.slice(voiceStart);
  const body = voiceStart === -1 ? markdown : markdown.slice(0, voiceStart);
  const palette = [...new Set([...body.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0].toLowerCase()))];
  const fonts = [...new Set([...body.matchAll(/^\|\s*\*\*([^*]+)\*\*\s*\|/gm)].map((match) => match[1].trim()))];
  const directionIds = [...voice.matchAll(/^- .+? \(([a-z0-9-]+)\):/gm)].map((match) => match[1]);
  return {
    name: field(voice, "Name") ?? title?.split(/[:|]/)[0].trim() ?? null,
    palette,
    fonts,
    tagline: field(voice, "Tagline"),
    tone: field(voice, "Tone"),
    audience: field(voice, "Audience"),
    directionIds,
  };
}

/** Palette tokens for colors that arrive without names. */
export function namePalette(hexes: string[]): PaletteColor[] {
  return hexes.map((hex, index) => ({ token: `${luma(hex) < DARK_LUMA ? "dark" : luma(hex) > 0.8 ? "light" : "mid"}-${index + 1}`, hex, use: "extracted" }));
}

/** A kit from an imported DESIGN.md: its palette and fonts, plus any voice and directions this app exported. */
export function kitFromDesignMd(markdown: string, catalog: SceneDirection[]): BrandKit {
  const parsed = parseDesignMd(markdown);
  const name = parsed.name ?? "Imported brand";
  const ids = parsed.directionIds.length ? parsed.directionIds : deriveDirectionIds(parsed.palette.map((color) => ({ color, weight: 1 })));
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    website: "",
    tagline: parsed.tagline ?? "",
    logo: "",
    logoUrl: "",
    logoKind: "image",
    palette: namePalette(parsed.palette.slice(0, 6)),
    typography: { display: parsed.fonts[0] ?? "Not specified", supporting: parsed.fonts[1] ?? parsed.fonts[0] ?? "Not specified" },
    tone: parsed.tone ?? "",
    audience: parsed.audience ?? "",
    sceneDirections: directionsFor(ids, catalog),
    heroImages: [],
    theme: pickTheme(parsed.palette),
    source: "import",
    designMd: markdown,
  };
}
