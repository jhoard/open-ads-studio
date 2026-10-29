// Vendored from James Hoard's Design Extractor (~/AI/design-creator, src/extractor.js).
// Changes for Open Ads Studio: the browser is injected (local Playwright or serverless
// Chromium), the crawl has a hard time budget, and the screenshot step is dropped.
import { extractColors } from './extractors/colors.js';
import { extractTypography } from './extractors/typography.js';
import { extractSpacing } from './extractors/spacing.js';
import { extractLayout } from './extractors/layout.js';
import { extractComponents } from './extractors/components.js';
import { extractEffects } from './extractors/effects.js';
import { extractAnimations } from './extractors/animations.js';
import { extractAssets } from './extractors/assets.js';
import { extractTokens } from './extractors/tokens.js';
import { formatDesignMd } from './formatter.js';

const NAVIGATION_TIMEOUT_MS = 20000;
const NETWORK_IDLE_TIMEOUT_MS = 5000;
const SCROLL_CAP_MS = 6000;
const SETTLE_MS = 800;

/**
 * Main extraction orchestrator.
 * @param {string} url
 * @param {{ launch: () => Promise<import('playwright-core').Browser>, onProgress?: (msg: string) => void }} options
 */
export async function extractDesign(url, options) {
  const { launch, onProgress } = options;
  const log = (msg) => onProgress?.(msg);

  log('Launching browser...');
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    try {
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS });
    } catch {
      log('Page still loading network requests, continuing...');
    }

    // Scroll through the page to trigger lazy-loaded content and scroll animations
    log('Loading lazy content...');
    await autoScroll(page);
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => window.scrollTo(0, 0));

    const title = await page.title();

    log('Extracting colors...');
    const colors = await extractColors(page);
    log('Extracting typography...');
    const typography = await extractTypography(page);
    log('Extracting spacing...');
    const spacing = await extractSpacing(page);
    log('Extracting layout...');
    const layout = await extractLayout(page);
    log('Extracting components...');
    const components = await extractComponents(page);
    log('Extracting effects...');
    const effects = await extractEffects(page);
    log('Extracting animations...');
    const animations = await extractAnimations(page);
    log('Extracting assets...');
    const assets = await extractAssets(page);
    log('Extracting design tokens...');
    const tokens = await extractTokens(page);

    const data = {
      url,
      title,
      date: new Date().toISOString().split('T')[0],
      screenshotPath: null,
      colors,
      typography,
      spacing,
      layout,
      components,
      effects,
      animations,
      assets,
      tokens,
    };

    log('Generating DESIGN.md...');
    const markdown = formatDesignMd(data);

    return { markdown, data };
  } finally {
    await browser.close();
  }
}

/**
 * Scroll through the page to trigger lazy-loaded images,
 * scroll-triggered animations, and intersection observer content.
 */
async function autoScroll(page) {
  await page.evaluate(async (capMs) => {
    await new Promise((resolve) => {
      const distance = 600;
      const delay = 100;
      let totalHeight = 0;
      const scrollHeight = document.body.scrollHeight;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, delay);
      setTimeout(() => { clearInterval(timer); resolve(); }, capMs);
    });
  }, SCROLL_CAP_MS);
}
