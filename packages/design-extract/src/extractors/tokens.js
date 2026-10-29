/**
 * Extract CSS custom properties (design tokens) and meta design settings.
 */
export async function extractTokens(page) {
  return page.evaluate(() => {
    const tokens = {};

    // Extract CSS custom properties from :root / html / body
    const rootStyles = getComputedStyle(document.documentElement);
    const bodyStyles = getComputedStyle(document.body);

    // Scan all stylesheets for custom property declarations
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.style) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith('--')) {
                  const value = rule.style.getPropertyValue(prop).trim();
                  if (value && !tokens[prop]) {
                    tokens[prop] = value;
                  }
                }
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    // Also check computed root properties
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === ':root' || rule.selectorText === 'html') {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith('--')) {
                const value = rule.style.getPropertyValue(prop).trim();
                if (value) tokens[prop] = value;
              }
            }
          }
        }
      } catch (e) {}
    }

    // Categorize tokens
    const colorTokens = {};
    const spacingTokens = {};
    const typographyTokens = {};
    const radiusTokens = {};
    const shadowTokens = {};
    const motionTokens = {};
    const otherTokens = {};

    for (const [name, value] of Object.entries(tokens)) {
      const n = name.toLowerCase();
      if (n.includes('color') || n.includes('bg') || n.includes('foreground') || n.includes('border-color') ||
          n.includes('accent') || n.includes('primary') || n.includes('secondary') || n.includes('muted') ||
          n.includes('destructive') || n.includes('surface') || n.includes('brand') ||
          value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl') || value.startsWith('oklch') || value.startsWith('oklab')) {
        colorTokens[name] = value;
      } else if (n.includes('spacing') || n.includes('space') || n.includes('gap') || n.includes('padding') || n.includes('margin') || n.includes('size') || n.includes('gutter')) {
        spacingTokens[name] = value;
      } else if (n.includes('font') || n.includes('text') || n.includes('line-height') || n.includes('letter') || n.includes('heading') || n.includes('body')) {
        typographyTokens[name] = value;
      } else if (n.includes('radius') || n.includes('rounded')) {
        radiusTokens[name] = value;
      } else if (n.includes('shadow') || n.includes('elevation')) {
        shadowTokens[name] = value;
      } else if (n.includes('duration') || n.includes('timing') || n.includes('ease') || n.includes('transition') || n.includes('animation') || n.includes('motion') || n.includes('delay')) {
        motionTokens[name] = value;
      } else {
        otherTokens[name] = value;
      }
    }

    // Detect meta viewport and theme-color
    const meta = {};
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) meta.themeColor = themeColor.content;
    const colorScheme = document.querySelector('meta[name="color-scheme"]');
    if (colorScheme) meta.colorScheme = colorScheme.content;
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) meta.viewport = viewport.content;

    // Detect dark mode support
    const hasDarkMode = !!document.querySelector('[class*="dark"]') ||
      !!document.querySelector('[data-theme="dark"]') ||
      Object.keys(tokens).some(k => k.includes('dark'));

    return {
      colorTokens,
      spacingTokens,
      typographyTokens,
      radiusTokens,
      shadowTokens,
      motionTokens,
      otherTokens,
      meta,
      hasDarkMode,
      totalTokenCount: Object.keys(tokens).length,
    };
  });
}
