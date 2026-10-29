/**
 * Extract layout patterns: flex/grid usage, container widths, breakpoints.
 */
export async function extractLayout(page) {
  return page.evaluate(() => {
    const flexPatterns = {};
    const gridPatterns = {};
    const containerWidths = {};
    const maxWidths = {};

    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const style = getComputedStyle(el);

      if (style.display === 'flex' || style.display === 'inline-flex') {
        const pattern = `${style.flexDirection} | ${style.justifyContent} | ${style.alignItems}`;
        flexPatterns[pattern] = (flexPatterns[pattern] || 0) + 1;
      }

      if (style.display === 'grid' || style.display === 'inline-grid') {
        const pattern = style.gridTemplateColumns || 'auto';
        gridPatterns[pattern] = (gridPatterns[pattern] || 0) + 1;
      }

      // Container/max-width detection
      if (style.maxWidth && style.maxWidth !== 'none' && style.maxWidth !== '0px') {
        maxWidths[style.maxWidth] = (maxWidths[style.maxWidth] || 0) + 1;
      }

      // Width patterns for containers (centered elements with margin auto)
      if (style.marginLeft === 'auto' && style.marginRight === 'auto') {
        const w = style.maxWidth !== 'none' ? style.maxWidth : style.width;
        if (w && w !== 'auto' && w !== '0px') {
          containerWidths[w] = (containerWidths[w] || 0) + 1;
        }
      }
    }

    // Detect breakpoints from stylesheets
    const breakpoints = new Set();
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule) {
              const match = rule.conditionText?.match(/(\d+)px/g);
              if (match) {
                match.forEach(bp => breakpoints.add(bp));
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheet, skip
        }
      }
    } catch (e) {}

    function sortByFreq(obj) {
      return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count }));
    }

    return {
      flexPatterns: sortByFreq(flexPatterns),
      gridPatterns: sortByFreq(gridPatterns),
      containerWidths: sortByFreq(containerWidths),
      maxWidths: sortByFreq(maxWidths),
      breakpoints: [...breakpoints].sort((a, b) => parseInt(a) - parseInt(b)),
    };
  });
}
