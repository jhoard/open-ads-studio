/**
 * Extract key assets: logos, hero images, favicon.
 */
export async function extractAssets(page) {
  return page.evaluate(() => {
    const assets = {
      favicon: null,
      logos: [],
      heroImages: [],
      icons: [],
    };

    // Favicon
    const faviconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
    if (faviconLink) {
      assets.favicon = faviconLink.href;
    }

    // Logo detection (images in header/nav, or with "logo" in class/alt/src)
    const logoSelectors = [
      'header img', 'nav img', '[class*="logo"] img', 'img[class*="logo"]',
      'img[alt*="logo" i]', 'img[src*="logo" i]',
      'header svg', 'nav svg', '[class*="logo"] svg',
    ];
    const logoCandidates = new Set();
    for (const sel of logoSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.tagName === 'IMG' && el.src) {
          logoCandidates.add(el.src);
        } else if (el.tagName === 'SVG') {
          logoCandidates.add('(inline SVG logo)');
        }
      }
    }
    assets.logos = [...logoCandidates].slice(0, 3);

    // Hero/large images
    const images = document.querySelectorAll('img');
    for (const img of images) {
      const rect = img.getBoundingClientRect();
      if (rect.width > 400 && rect.height > 200) {
        assets.heroImages.push({
          src: img.src,
          alt: img.alt || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
    assets.heroImages = assets.heroImages.slice(0, 5);

    // Icon fonts / SVG icon usage
    const svgIcons = document.querySelectorAll('svg');
    let svgIconCount = 0;
    for (const svg of svgIcons) {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 48 && rect.height <= 48 && rect.width > 0) {
        svgIconCount++;
      }
    }

    // Check for icon font usage
    const iconFonts = [];
    const allEls = document.querySelectorAll('[class*="icon"], [class*="fa-"], [class*="material-icon"], [class*="lucide"]');
    const iconClasses = new Set();
    for (const el of allEls) {
      const style = getComputedStyle(el);
      const family = style.fontFamily;
      if (family && !iconClasses.has(family)) {
        iconClasses.add(family);
      }
    }

    assets.icons = {
      svgIconCount,
      iconFontFamilies: [...iconClasses].slice(0, 5),
    };

    return assets;
  });
}
