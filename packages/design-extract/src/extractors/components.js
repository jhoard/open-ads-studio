/**
 * Identify UI components: buttons, cards, nav, forms, sections.
 */
export async function extractComponents(page) {
  return page.evaluate(() => {
    const components = {
      buttons: [],
      links: [],
      nav: [],
      cards: [],
      forms: [],
      inputs: [],
      sections: [],
      images: [],
    };

    // Buttons
    const buttons = document.querySelectorAll('button, [role="button"], a.btn, a.button, input[type="submit"], input[type="button"]');
    const seenButtons = new Set();
    for (const btn of buttons) {
      const style = getComputedStyle(btn);
      const text = btn.textContent?.trim().slice(0, 40);
      const key = `${style.backgroundColor}|${style.color}|${style.borderRadius}|${style.fontSize}`;
      if (seenButtons.has(key)) continue;
      seenButtons.add(key);
      components.buttons.push({
        text,
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderRadius: style.borderRadius,
        padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        border: style.border,
      });
    }

    // Navigation
    const navs = document.querySelectorAll('nav, header, [role="navigation"]');
    for (const nav of navs) {
      const style = getComputedStyle(nav);
      const links = nav.querySelectorAll('a');
      components.nav.push({
        tag: nav.tagName.toLowerCase(),
        linkCount: links.length,
        backgroundColor: style.backgroundColor,
        position: style.position,
        height: style.height,
      });
    }

    // Cards (heuristic: elements with shadow or border + padding + rounded corners)
    const allEls = document.querySelectorAll('div, article, section, li');
    const seenCards = new Set();
    for (const el of allEls) {
      const style = getComputedStyle(el);
      const hasShadow = style.boxShadow !== 'none';
      const hasRadius = parseFloat(style.borderRadius) > 0;
      const hasBorder = style.borderWidth !== '0px' && style.borderStyle !== 'none';
      const hasPadding = parseFloat(style.padding) > 0 || parseFloat(style.paddingTop) > 8;

      if ((hasShadow || hasBorder) && hasRadius && hasPadding) {
        const key = `${style.boxShadow}|${style.borderRadius}|${style.backgroundColor}`;
        if (seenCards.has(key)) continue;
        seenCards.add(key);
        components.cards.push({
          tag: el.tagName.toLowerCase(),
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow !== 'none' ? style.boxShadow : undefined,
          border: hasBorder ? style.border : undefined,
          padding: style.padding,
        });
      }
    }

    // Forms
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const inputs = form.querySelectorAll('input, textarea, select');
      components.forms.push({
        inputCount: inputs.length,
        action: form.action ? '(has action)' : 'none',
      });
    }

    // Inputs
    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
    const seenInputs = new Set();
    for (const input of inputs) {
      const style = getComputedStyle(input);
      const key = `${style.borderRadius}|${style.border}|${style.padding}|${style.fontSize}`;
      if (seenInputs.has(key)) continue;
      seenInputs.add(key);
      components.inputs.push({
        type: input.type || input.tagName.toLowerCase(),
        borderRadius: style.borderRadius,
        border: style.border,
        padding: style.padding,
        fontSize: style.fontSize,
        backgroundColor: style.backgroundColor,
      });
    }

    // Sections (large container divs/sections)
    const sections = document.querySelectorAll('section, [class*="section"], [class*="hero"], main > div');
    for (const section of [...sections].slice(0, 8)) {
      const style = getComputedStyle(section);
      components.sections.push({
        tag: section.tagName.toLowerCase(),
        className: section.className?.toString().slice(0, 60),
        backgroundColor: style.backgroundColor,
        padding: `${style.paddingTop} ${style.paddingBottom}`,
      });
    }

    return {
      buttons: components.buttons.slice(0, 6),
      nav: components.nav.slice(0, 3),
      cards: components.cards.slice(0, 6),
      forms: components.forms.slice(0, 3),
      inputs: components.inputs.slice(0, 4),
      sections: components.sections.slice(0, 8),
    };
  });
}
