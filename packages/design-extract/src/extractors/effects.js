/**
 * Extract visual effects: shadows, border-radius, borders, opacity.
 */
export async function extractEffects(page) {
  return page.evaluate(() => {
    const shadows = {};
    const borderRadii = {};
    const borders = {};
    const opacities = {};

    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const style = getComputedStyle(el);

      if (style.boxShadow && style.boxShadow !== 'none') {
        shadows[style.boxShadow] = (shadows[style.boxShadow] || 0) + 1;
      }

      if (style.borderRadius && style.borderRadius !== '0px') {
        borderRadii[style.borderRadius] = (borderRadii[style.borderRadius] || 0) + 1;
      }

      if (style.borderWidth !== '0px' && style.borderStyle !== 'none') {
        const border = `${style.borderWidth} ${style.borderStyle} ${style.borderColor}`;
        borders[border] = (borders[border] || 0) + 1;
      }

      if (style.opacity !== '1') {
        opacities[style.opacity] = (opacities[style.opacity] || 0) + 1;
      }
    }

    function sortByFreq(obj) {
      return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));
    }

    return {
      shadows: sortByFreq(shadows),
      borderRadii: sortByFreq(borderRadii),
      borders: sortByFreq(borders),
      opacities: sortByFreq(opacities),
    };
  });
}
