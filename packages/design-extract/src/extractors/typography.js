/**
 * Extract typography information: font families, sizes, weights, line-heights.
 */
export async function extractTypography(page) {
  return page.evaluate(() => {
    const fonts = {};
    const sizes = {};
    const weights = {};
    const lineHeights = {};
    const headings = [];

    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const style = getComputedStyle(el);
      const text = el.textContent?.trim();
      if (!text) continue;

      const family = style.fontFamily;
      const size = style.fontSize;
      const weight = style.fontWeight;
      const lh = style.lineHeight;

      if (family) fonts[family] = (fonts[family] || 0) + 1;
      if (size) sizes[size] = (sizes[size] || 0) + 1;
      if (weight) weights[weight] = (weights[weight] || 0) + 1;
      if (lh && lh !== 'normal') lineHeights[lh] = (lineHeights[lh] || 0) + 1;
    }

    // Extract heading styles
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const els = document.querySelectorAll(tag);
      for (const el of els) {
        const style = getComputedStyle(el);
        headings.push({
          tag,
          text: el.textContent?.trim().slice(0, 60),
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontFamily: style.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          color: style.color,
        });
      }
    }

    // Extract body text style
    const body = document.querySelector('body');
    const bodyStyle = body ? getComputedStyle(body) : null;
    const bodyFont = bodyStyle ? {
      fontFamily: bodyStyle.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
      fontSize: bodyStyle.fontSize,
      fontWeight: bodyStyle.fontWeight,
      lineHeight: bodyStyle.lineHeight,
      color: bodyStyle.color,
    } : null;

    function sortByFreq(obj) {
      return Object.entries(obj).sort((a, b) => b[1] - a[1]);
    }

    // Clean font family names
    const fontFamilies = sortByFreq(fonts).map(([family, count]) => ({
      family: family.split(',')[0].replace(/['"]/g, '').trim(),
      fullStack: family,
      count,
    }));

    // Dedupe font families by primary name
    const seen = new Set();
    const uniqueFonts = fontFamilies.filter(f => {
      if (seen.has(f.family)) return false;
      seen.add(f.family);
      return true;
    });

    return {
      fontFamilies: uniqueFonts.slice(0, 6),
      fontSizes: sortByFreq(sizes).slice(0, 12).map(([size, count]) => ({ size, count })),
      fontWeights: sortByFreq(weights).slice(0, 8).map(([weight, count]) => ({ weight, count })),
      lineHeights: sortByFreq(lineHeights).slice(0, 8).map(([lh, count]) => ({ lineHeight: lh, count })),
      headings: headings.slice(0, 12),
      bodyFont,
    };
  });
}
