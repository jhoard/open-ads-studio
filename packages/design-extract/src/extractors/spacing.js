/**
 * Extract spacing patterns: padding, margin, gap values.
 */
export async function extractSpacing(page) {
  return page.evaluate(() => {
    const paddings = {};
    const margins = {};
    const gaps = {};

    function addValues(obj, value) {
      if (!value || value === '0px') return;
      // Normalize multi-value shorthand
      const parts = value.split(' ').filter(v => v !== '0px');
      for (const part of parts) {
        if (part && part !== '0px') {
          obj[part] = (obj[part] || 0) + 1;
        }
      }
    }

    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const style = getComputedStyle(el);

      addValues(paddings, style.paddingTop);
      addValues(paddings, style.paddingRight);
      addValues(paddings, style.paddingBottom);
      addValues(paddings, style.paddingLeft);

      addValues(margins, style.marginTop);
      addValues(margins, style.marginRight);
      addValues(margins, style.marginBottom);
      addValues(margins, style.marginLeft);

      if (style.gap && style.gap !== 'normal' && style.gap !== '0px') {
        addValues(gaps, style.gap);
      }
      if (style.rowGap && style.rowGap !== 'normal' && style.rowGap !== '0px') {
        addValues(gaps, style.rowGap);
      }
      if (style.columnGap && style.columnGap !== 'normal' && style.columnGap !== '0px') {
        addValues(gaps, style.columnGap);
      }
    }

    function sortByFreq(obj) {
      return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([value, count]) => ({ value, count }));
    }

    // Build a spacing scale from all values
    const allValues = new Map();
    for (const [v, c] of Object.entries({ ...paddings, ...margins, ...gaps })) {
      const px = parseFloat(v);
      if (!isNaN(px) && px > 0) {
        allValues.set(px, (allValues.get(px) || 0) + c);
      }
    }

    const spacingScale = [...allValues.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([px]) => px <= 200)
      .slice(0, 20)
      .map(([px, count]) => ({ px, rem: +(px / 16).toFixed(3), count }));

    return {
      paddings: sortByFreq(paddings),
      margins: sortByFreq(margins),
      gaps: sortByFreq(gaps),
      spacingScale,
    };
  });
}
