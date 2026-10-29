import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { extractDesign, type ExtractedDesign } from "../../../packages/design-extract/src/extractor.js";
import { deriveDirectionIds, directionsFor, namePalette, pickTheme, type BrandKit } from "@/lib/brand-kit";
import type { SceneDirection } from "@/lib/types";

// Brand from URL: the vendored Design Extractor, run in local Playwright or serverless Chromium.

/** Total budget for one crawl, inside the route's 60 s function limit. */
const CRAWL_BUDGET_MS = 45_000;
const MAX_PALETTE = 6;
const MAX_HERO_IMAGES = 4;

export class CrawlInputError extends Error {}

// Every range a crawl must never reach: private, loopback, link-local (cloud metadata), CGNAT, multicast.
const BLOCKED = new BlockList();
for (const [net, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32]] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv6");
}

/** An IPv4-mapped IPv6 address (::ffff:a.b.c.d, or the hex form ::ffff:7f00:1) as plain IPv4. */
function unmapIPv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower) ?? /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function isPrivateAddress(address: string): boolean {
  const mapped = unmapIPv4(address);
  if (mapped) return BLOCKED.check(mapped, "ipv4");
  const family = isIP(address);
  if (family === 0) return true;
  return BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

const isLocalName = (host: string): boolean => host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");

/** Resolves a host and returns its addresses, or null when any of them is private. */
async function publicAddresses(host: string): Promise<string[] | null> {
  if (isLocalName(host)) return null;
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) return null;
  return addresses;
}

interface VettedSite {
  url: URL;
  /** The address the crawl is pinned to, so a DNS rebind cannot swap in a private one. */
  address: string;
}

/** Public http(s) sites only: no localhost, no private or link-local addresses (blocks SSRF into our network). */
export async function validateSiteUrl(raw: string): Promise<VettedSite> {
  let url: URL;
  try {
    // A bare domain gets https; anything with its own scheme is parsed as is, so ftp: and file: are refused below.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new CrawlInputError("That does not look like a website address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new CrawlInputError("Use an http or https website address.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isLocalName(host)) throw new CrawlInputError("Local and internal addresses cannot be crawled.");
  if (!isIP(host) && (await lookup(host, { all: true }).catch(() => [])).length === 0) throw new CrawlInputError(`Could not find ${host}.`);
  const addresses = await publicAddresses(host);
  if (!addresses) throw new CrawlInputError("Local and internal addresses cannot be crawled.");
  return { url, address: addresses[0] };
}

/**
 * Keeps a crawl on public addresses. The route blocks any request whose host is private. Playwright
 * does not re-route redirect hops, so a request listener also checks every hop and marks the crawl
 * tainted; a tainted crawl is abandoned before anything from the page is read. A blind GET to a
 * redirect target can still happen; its response never reaches the extraction.
 */
export function createGuard(isPrivateHost: (host: string) => Promise<boolean>) {
  const verdicts = new Map<string, Promise<boolean>>();
  let tainted: string | null = null;
  const isHttp = (url: URL): boolean => url.protocol === "http:" || url.protocol === "https:";
  const isPrivate = (url: URL): Promise<boolean> => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let verdict = verdicts.get(host);
    if (!verdict) {
      verdict = isPrivateHost(host);
      verdicts.set(host, verdict);
    }
    return verdict;
  };

  return {
    prepareContext: async (context: BrowserContext): Promise<void> => {
      context.on("request", (request) => {
        const url = new URL(request.url());
        if (!isHttp(url)) return;
        void isPrivate(url).then((hit) => {
          if (hit && !tainted) tainted = request.url();
        });
      });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
        if (!isHttp(url) || (await isPrivate(url))) return route.abort("blockedbyclient");
        return route.continue();
      });
    },
    /** Throws when any request, redirect hops included, went for a private address. */
    assertClean: async (): Promise<void> => {
      await Promise.all(verdicts.values());
      if (tainted) {
        console.warn("crawl stopped: request to a private address", tainted);
        throw new CrawlInputError("The site redirected to a local or internal address, so the crawl stopped.");
      }
    },
  };
}

/** Private when the name is local or any address it resolves to is private. A name that does not resolve reaches nothing. */
async function privateHost(host: string): Promise<boolean> {
  if (isLocalName(host)) return true;
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  return addresses.some(isPrivateAddress);
}

/** Serverless Chromium on Vercel; the cached Playwright Chromium everywhere else. The site's host is pinned. */
function launcher(site: VettedSite): () => Promise<Browser> {
  const pin = `--host-resolver-rules=MAP ${site.url.hostname} ${site.address.includes(":") ? `[${site.address}]` : site.address}`;
  return async () => {
    if (process.env.VERCEL) {
      const serverless = (await import("@sparticuz/chromium")).default;
      return chromium.launch({ executablePath: await serverless.executablePath(), args: [...serverless.args, pin], headless: true });
    }
    return chromium.launch({ headless: true, args: [pin] });
  };
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
  const site = await validateSiteUrl(raw);
  const guard = createGuard(privateHost);
  const { markdown, data } = await withTimeout(
    extractDesign(site.url.toString(), { launch: launcher(site), prepareContext: guard.prepareContext, beforeExtract: guard.assertClean }),
    CRAWL_BUDGET_MS,
  );
  await guard.assertClean();
  return toKit(data, markdown, site.url, catalog);
}
