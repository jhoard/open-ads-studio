import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { extractDesign, type ExtractedDesign } from "../../../packages/design-extract/src/extractor.js";
import { deriveDirectionIds, directionsFor, namePalette, neutralDirections, pickTheme, type BrandKit } from "@/lib/brand-kit";
import type { SceneDirection } from "@/lib/types";
import { CrawlInputError, isLocalName, isPrivateAddress, validateSiteUrl, type VettedSite } from "./public-url";
export { CrawlInputError, isPrivateAddress, validateSiteUrl } from "./public-url";

// Brand from URL: the vendored Design Extractor, run in local Playwright or serverless Chromium.

/** Total budget for one crawl, inside the route's 60 s function limit. */
const CRAWL_BUDGET_MS = 45_000;
const MAX_PALETTE = 6;
const MAX_HERO_IMAGES = 4;

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

function withTimeout<T>(work: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error(`The crawl took longer than ${Math.round(ms / 1000)} s.`)); }, ms);
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
  if (/^(just a moment|access denied|attention required|forbidden|error\b)/i.test(data.title.trim())) throw new Error("The site blocked extraction.");
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
    sceneDirections: directionsFor(deriveDirectionIds(weighted), neutralDirections(catalog)),
    heroImages: data.assets.heroImages.map((image) => image.src).filter((src) => /^https?:\/\//.test(src)).slice(0, MAX_HERO_IMAGES),
    theme: pickTheme(hexes),
    source: "crawl",
    designMd: markdown,
  };
}

export async function crawlBrand(raw: string, catalog: SceneDirection[]): Promise<BrandKit> {
  const site = await validateSiteUrl(raw);
  const guard = createGuard(privateHost);
  const controller = new AbortController();
  const { markdown, data } = await withTimeout(
    extractDesign(site.url.toString(), { launch: launcher(site), prepareContext: guard.prepareContext, beforeExtract: guard.assertClean, signal: controller.signal }),
    CRAWL_BUDGET_MS,
    controller,
  );
  await guard.assertClean();
  return toKit(data, markdown, site.url, catalog);
}
