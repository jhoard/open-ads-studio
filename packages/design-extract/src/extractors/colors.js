/**
 * Extract all colors used on the page, categorized by role.
 */
export async function extractColors(page) {
  return page.evaluate(() => {
    const colorMap = { background: {}, text: {}, border: {}, other: {} };

    function normalizeColor(raw) {
      if (!raw || raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') return null;
      // Convert rgb/rgba to hex where possible
      const match = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const [, r, g, b, a] = match;
        if (a !== undefined && parseFloat(a) < 1) {
          return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
      }
      return raw;
    }

    function luminance(hex) {
      if (!hex.startsWith('#')) return 0.5;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const style = getComputedStyle(el);

      const bgColor = normalizeColor(style.backgroundColor);
      if (bgColor) colorMap.background[bgColor] = (colorMap.background[bgColor] || 0) + 1;

      const textColor = normalizeColor(style.color);
      if (textColor) colorMap.text[textColor] = (colorMap.text[textColor] || 0) + 1;

      const borderColor = normalizeColor(style.borderColor);
      if (borderColor && style.borderWidth !== '0px') {
        colorMap.border[borderColor] = (colorMap.border[borderColor] || 0) + 1;
      }

      // Gradients from background-image
      if (style.backgroundImage && style.backgroundImage.includes('gradient')) {
        colorMap.other[style.backgroundImage] = (colorMap.other[style.backgroundImage] || 0) + 1;
      }
    }

    // Sort by frequency
    function sortByFrequency(obj) {
      return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([color, count]) => ({ color, count }));
    }

    const backgrounds = sortByFrequency(colorMap.background);
    const texts = sortByFrequency(colorMap.text);
    const borders = sortByFrequency(colorMap.border);
    const gradients = sortByFrequency(colorMap.other);

    // Classify colors
    const allColors = new Map();
    for (const { color, count } of [...backgrounds, ...texts, ...borders]) {
      if (color.startsWith('#')) {
        allColors.set(color, (allColors.get(color) || 0) + count);
      }
    }

    const sorted = [...allColors.entries()].sort((a, b) => b[1] - a[1]);

    // Categorize
    const neutrals = [];
    const primary = [];

    for (const [color] of sorted) {
      const lum = luminance(color);
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

      if (saturation < 0.15) {
        neutrals.push(color);
      } else {
        primary.push(color);
      }
    }

    return {
      primary: primary.slice(0, 10),
      neutrals: neutrals.slice(0, 10),
      backgrounds: backgrounds.slice(0, 8),
      texts: texts.slice(0, 8),
      borders: borders.slice(0, 6),
      gradients: gradients.slice(0, 4),
    };
  });
}
