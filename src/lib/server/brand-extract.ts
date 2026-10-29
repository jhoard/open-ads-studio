import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { extractDesign, type ExtractedDesign } from "../../../packages/design-extract/src/extractor.js";
import { deriveDirectionIds, directionsFor, namePalette, pickTheme, type BrandKit } from "@/lib/brand-kit";
import type { Brand, SceneDirection } from "@/lib/types";

// Brand from URL: the vendored Design Extractor, run in local Playwright or serverless Chromium.

/** Total budget for one crawl, inside the route's 60 s function limit. */
const CRAWL_BUDGET_MS = 45_000;
const MAX_PALETTE = 6;
const MAX_HERO_IMAGES = 4;

export class CrawlInputError extends Error {}

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return PRIVATE_V4.some((pattern) => pattern.test(address));
  const lower = address.toLowerCase();
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80") || lower.startsWith("::ffff:127.") || lower.startsWith("::ffff:10.") || lower.startsWith("::ffff:192.168.");
}

/** Public http(s) sites only: no localhost, no private or link-local addresses (blocks SSRF into our network). */
export async function validateSiteUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    // A bare domain gets https; anything with its own scheme is parsed as is, so ftp: and file: are refused below.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new CrawlInputError("That does not look like a website address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new CrawlInputError("Use an http or https website address.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new CrawlInputError("Local and internal addresses cannot be crawled.");
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0) throw new CrawlInputError(`Could not find ${host}.`);
  if (addresses.some(isPrivateAddress)) throw new CrawlInputError("Local and internal addresses cannot be crawled.");
  return url;
}

/** Serverless Chromium on Vercel; the cached Playwright Chromium everywhere else. */
async function launch(): Promise<Browser> {
  if (process.env.VERCEL) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({ executablePath: await serverless.executablePath(), args: serverless.args, headless: true });
  }
  return chromium.launch({ headless: true });
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`The crawl took longer than ${Math.round(ms / 1000)} s.`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function brandName(title: string, url: URL): string {
  const first = title.split(/\s[|:–-]\s|\s\|\s/)[0]?.trim();
  if (first && first.length <= 40) return first;
  const host = url.hostname.replace(/^www\./, "").split(".")[0];
  return host.charAt(0).toUpperCase() + host.slice(1);
}

// Consent banners ship their own logos; never mistake one for the brand's.
const THIRD_PARTY_LOGO = /cookielaw|onetrust|cookiebot|consent|trustarc|usercentrics/i;

const siteRoot = (host: string): string => host.replace(/^www\./, "").split(".").slice(-2).join(".");

/** A logo served from the site's own domain first, then any non-banner logo, then the favicon. */
function pickLogo(data: ExtractedDesign, url: URL): string {
  const candidates = data.assets.logos.filter((candidate) => /^https?:\/\//.test(candidate) && !THIRD_PARTY_LOGO.test(candidate));
  const own = candidates.find((candidate) => new URL(candidate).hostname.endsWith(siteRoot(url.hostname)));
  return own ?? candidates[0] ?? data.assets.favicon ?? new URL("/favicon.ico", url).toString();
}

/** Map the Extractor's output onto the kit: palette, type, logo, hero images, theme, directions. */
function toKit(data: ExtractedDesign, markdown: string, url: URL, catalog: SceneDirection[]): BrandKit {
  const hexes = [...data.colors.primary, ...data.colors.neutrals].filter((hex) => /^#[0-9a-f]{6}$/i.test(hex)).slice(0, MAX_PALETTE);
  const display = data.typography.headings.find((heading) => heading.tag === "h1") ?? data.typography.headings[0];
  const body = data.typography.bodyFont?.fontFamily ?? data.typography.fontFamilies[0]?.family ?? "the site's body face";
  const logo = pickLogo(data, url);
  const weighted = data.colors.backgrounds.map((entry) => ({ color: entry.color, weight: entry.count }));
  const name = brandName(data.title, url);
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    website: url.toString(),
    tagline: data.title.length <= 80 ? data.title : name,
    logo,
    logoUrl: logo,
    logoKind: "image",
    palette: namePalette(hexes),
    typography: {
      display: display ? `${display.fontFamily}, weight ${display.fontWeight}, ${display.fontSize} headings` : body,
      supporting: body,
    },
    tone: "",
    audience: "",
    sceneDirections: directionsFor(deriveDirectionIds(weighted), catalog),
    heroImages: data.assets.heroImages.map((image) => image.src).filter((src) => /^https?:\/\//.test(src)).slice(0, MAX_HERO_IMAGES),
    theme: pickTheme(hexes),
    source: "crawl",
    designMd: markdown,
  };
}

export async function crawlBrand(raw: string, catalog: SceneDirection[]): Promise<BrandKit> {
  const url = await validateSiteUrl(raw);
  const { markdown, data } = await withTimeout(extractDesign(url.toString(), { launch }), CRAWL_BUDGET_MS);
  return toKit(data, markdown, url, catalog);
}

/** The preloaded Tauvel kit, with its cached DESIGN.md. */
export async function cachedKit(brand: Brand, logoUrl: string): Promise<BrandKit> {
  const designMd = await readFile(path.join(process.cwd(), "assets", "tauvel", "DESIGN.md"), "utf8");
  const hex = (token: string): string | undefined => brand.palette.find((color) => color.token === token)?.hex;
  return {
    ...brand,
    logoUrl,
    logoKind: "mask",
    heroImages: [],
    theme: { surface: hex("bottle-green") ?? brand.palette[0].hex, accent: hex("brushed-gold") ?? brand.palette[1].hex },
    source: "cached",
    designMd,
  };
}
