/**
 * Format extracted design data into a structured DESIGN.md.
 */
export function formatDesignMd(data) {
  const lines = [];
  const { url, title, date, screenshotPath, colors, typography, spacing, layout, components, effects, animations, assets } = data;

  lines.push(`# DESIGN.md: ${title || 'Untitled'}`);
  lines.push(`> Extracted from [${url}](${url}) on ${date}`);
  lines.push(`> Built by [JEH3 Incorporated](https://jeh3incorporated.com)`);
  lines.push('');

  // Screenshot
  if (screenshotPath) {
    lines.push('## Screenshot');
    lines.push(`![Page Screenshot](./${screenshotPath})`);
    lines.push('');
  }

  // ──────────── Colors ────────────
  lines.push('---');
  lines.push('## Colors');
  lines.push('');

  // Use HTML spans for inline swatches: the web UI styles .swatch,
  // and downloaded Markdown still renders on GitHub/VS Code.
  function swatch(hex) {
    return `<span class="swatch" style="display:inline-block;width:14px;height:14px;border:1px solid #ccc;background:${hex};vertical-align:middle"></span>`;
  }

  if (colors.primary.length) {
    lines.push('### Primary Palette');
    lines.push('| Swatch | Hex |');
    lines.push('|--------|-----|');
    for (const c of colors.primary) {
      lines.push(`| ${swatch(c)} | \`${c}\` |`);
    }
    lines.push('');
  }

  if (colors.neutrals.length) {
    lines.push('### Neutrals / Grayscale');
    lines.push('| Swatch | Hex |');
    lines.push('|--------|-----|');
    for (const c of colors.neutrals) {
      lines.push(`| ${swatch(c)} | \`${c}\` |`);
    }
    lines.push('');
  }

  if (colors.backgrounds.length) {
    lines.push('### Background Colors (by frequency)');
    lines.push('| Color | Usage Count |');
    lines.push('|-------|------------|');
    for (const { color, count } of colors.backgrounds) {
      lines.push(`| \`${color}\` | ${count} |`);
    }
    lines.push('');
  }

  if (colors.texts.length) {
    lines.push('### Text Colors (by frequency)');
    lines.push('| Color | Usage Count |');
    lines.push('|-------|------------|');
    for (const { color, count } of colors.texts) {
      lines.push(`| \`${color}\` | ${count} |`);
    }
    lines.push('');
  }

  if (colors.gradients.length) {
    lines.push('### Gradients');
    for (const { color } of colors.gradients) {
      lines.push(`- \`${color}\``);
    }
    lines.push('');
  }

  // ──────────── Typography ────────────
  lines.push('---');
  lines.push('## Typography');
  lines.push('');

  if (typography.fontFamilies.length) {
    lines.push('### Font Families');
    lines.push('| Font | Full Stack | Usage |');
    lines.push('|------|-----------|-------|');
    for (const { family, fullStack, count } of typography.fontFamilies) {
      lines.push(`| **${family}** | \`${fullStack}\` | ${count} |`);
    }
    lines.push('');
  }

  if (typography.bodyFont) {
    lines.push('### Body Text');
    const b = typography.bodyFont;
    lines.push(`- Font: **${b.fontFamily}**`);
    lines.push(`- Size: \`${b.fontSize}\``);
    lines.push(`- Weight: \`${b.fontWeight}\``);
    lines.push(`- Line Height: \`${b.lineHeight}\``);
    lines.push(`- Color: \`${b.color}\``);
    lines.push('');
  }

  if (typography.headings.length) {
    lines.push('### Heading Styles');
    lines.push('| Tag | Text | Font | Size | Weight | Line Height |');
    lines.push('|-----|------|------|------|--------|-------------|');
    for (const h of typography.headings) {
      lines.push(`| \`${h.tag}\` | ${h.text?.slice(0, 30) || ''} | ${h.fontFamily} | \`${h.fontSize}\` | \`${h.fontWeight}\` | \`${h.lineHeight}\` |`);
    }
    lines.push('');
  }

  if (typography.fontSizes.length) {
    lines.push('### Type Scale');
    lines.push('| Size | Usage Count |');
    lines.push('|------|------------|');
    for (const { size, count } of typography.fontSizes) {
      lines.push(`| \`${size}\` | ${count} |`);
    }
    lines.push('');
  }

  if (typography.fontWeights.length) {
    lines.push('### Font Weights');
    lines.push('| Weight | Usage Count |');
    lines.push('|--------|------------|');
    for (const { weight, count } of typography.fontWeights) {
      lines.push(`| \`${weight}\` | ${count} |`);
    }
    lines.push('');
  }

  // ──────────── Spacing ────────────
  lines.push('---');
  lines.push('## Spacing');
  lines.push('');

  if (spacing.spacingScale.length) {
    lines.push('### Spacing Scale');
    lines.push('| px | rem | Usage |');
    lines.push('|----|-----|-------|');
    for (const { px, rem, count } of spacing.spacingScale) {
      lines.push(`| \`${px}px\` | \`${rem}rem\` | ${count} |`);
    }
    lines.push('');
  }

  if (spacing.gaps.length) {
    lines.push('### Gap Values');
    lines.push('| Value | Usage Count |');
    lines.push('|-------|------------|');
    for (const { value, count } of spacing.gaps) {
      lines.push(`| \`${value}\` | ${count} |`);
    }
    lines.push('');
  }

  // ──────────── Layout ────────────
  lines.push('---');
  lines.push('## Layout');
  lines.push('');

  if (layout.containerWidths.length) {
    lines.push('### Container Widths');
    lines.push('| Width | Usage Count |');
    lines.push('|-------|------------|');
    for (const { value, count } of layout.containerWidths) {
      lines.push(`| \`${value}\` | ${count} |`);
    }
    lines.push('');
  }

  if (layout.maxWidths.length) {
    lines.push('### Max Widths');
    lines.push('| Value | Usage Count |');
    lines.push('|-------|------------|');
    for (const { value, count } of layout.maxWidths) {
      lines.push(`| \`${value}\` | ${count} |`);
    }
    lines.push('');
  }

  if (layout.flexPatterns.length) {
    lines.push('### Flex Patterns');
    lines.push('| Direction | Justify | Align | Usage |');
    lines.push('|-----------|---------|-------|-------|');
    for (const { value, count } of layout.flexPatterns) {
      const [dir, just, align] = value.split(' | ');
      lines.push(`| \`${dir}\` | \`${just}\` | \`${align}\` | ${count} |`);
    }
    lines.push('');
  }

  if (layout.gridPatterns.length) {
    lines.push('### Grid Patterns');
    lines.push('| Template Columns | Usage |');
    lines.push('|-----------------|-------|');
    for (const { value, count } of layout.gridPatterns) {
      lines.push(`| \`${value}\` | ${count} |`);
    }
    lines.push('');
  }

  if (layout.breakpoints.length) {
    lines.push('### Breakpoints (detected from CSS)');
    for (const bp of layout.breakpoints) {
      lines.push(`- \`${bp}\``);
    }
    lines.push('');
  }

  // ──────────── Components ────────────
  lines.push('---');
  lines.push('## Components');
  lines.push('');

  if (components.buttons.length) {
    lines.push('### Buttons');
    for (const btn of components.buttons) {
      lines.push(`#### "${btn.text || 'Button'}"`);
      lines.push(`- Background: \`${btn.backgroundColor}\``);
      lines.push(`- Text Color: \`${btn.color}\``);
      lines.push(`- Border Radius: \`${btn.borderRadius}\``);
      lines.push(`- Padding: \`${btn.padding}\``);
      lines.push(`- Font Size: \`${btn.fontSize}\` / Weight: \`${btn.fontWeight}\``);
      if (btn.border && btn.border !== 'none') lines.push(`- Border: \`${btn.border}\``);
      lines.push('');
    }
  }

  if (components.nav.length) {
    lines.push('### Navigation');
    for (const nav of components.nav) {
      lines.push(`- \`<${nav.tag}>\`: ${nav.linkCount} links, bg: \`${nav.backgroundColor}\`, position: \`${nav.position}\`, height: \`${nav.height}\``);
    }
    lines.push('');
  }

  if (components.cards.length) {
    lines.push('### Cards');
    for (const card of components.cards) {
      lines.push(`- \`<${card.tag}>\`: bg: \`${card.backgroundColor}\`, radius: \`${card.borderRadius}\`, padding: \`${card.padding}\`${card.boxShadow ? `, shadow: \`${card.boxShadow}\`` : ''}`);
    }
    lines.push('');
  }

  if (components.inputs.length) {
    lines.push('### Form Inputs');
    for (const input of components.inputs) {
      lines.push(`- Type: \`${input.type}\`: radius: \`${input.borderRadius}\`, border: \`${input.border}\`, padding: \`${input.padding}\`, font: \`${input.fontSize}\``);
    }
    lines.push('');
  }

  if (components.sections.length) {
    lines.push('### Page Sections');
    for (const section of components.sections) {
      lines.push(`- \`<${section.tag}>\`${section.className ? ` class="${section.className}"` : ''}: bg: \`${section.backgroundColor}\`, padding: \`${section.padding}\``);
    }
    lines.push('');
  }

  // ──────────── Effects ────────────
  lines.push('---');
  lines.push('## Effects');
  lines.push('');

  if (effects.shadows.length) {
    lines.push('### Box Shadows');
    for (const { value, count } of effects.shadows) {
      lines.push(`- \`${value}\` (${count}x)`);
    }
    lines.push('');
  }

  if (effects.borderRadii.length) {
    lines.push('### Border Radius');
    lines.push('| Value | Usage Count |');
    lines.push('|-------|------------|');
    for (const { value, count } of effects.borderRadii) {
      lines.push(`| \`${value}\` | ${count} |`);
    }
    lines.push('');
  }

  if (effects.borders.length) {
    lines.push('### Borders');
    for (const { value, count } of effects.borders) {
      lines.push(`- \`${value}\` (${count}x)`);
    }
    lines.push('');
  }

  // ──────────── Animations & Motion ────────────
  lines.push('---');
  lines.push('## Animations & Motion');
  lines.push('');

  if (animations.durations?.length) {
    lines.push('### Durations');
    lines.push('| Duration | Usage Count |');
    lines.push('|----------|------------|');
    for (const { value, count } of animations.durations) {
      lines.push(`| \`${value}\` | ${count} |`);
    }
    lines.push('');
  }

  if (animations.timingFunctions?.length) {
    lines.push('### Easing / Timing Functions');
    for (const { value, count } of animations.timingFunctions) {
      lines.push(`- \`${value}\` (${count}x)`);
    }
    lines.push('');
  }

  if (animations.transitions?.length) {
    lines.push('### Transition Patterns');
    for (const { value, count } of animations.transitions) {
      lines.push(`- \`${value}\` (${count}x)`);
    }
    lines.push('');
  }

  if (animations.transforms?.length) {
    lines.push('### Active Transforms');
    for (const { value, count } of animations.transforms) {
      lines.push(`- \`${value}\` (${count}x)`);
    }
    lines.push('');
  }

  if (animations.animations?.length) {
    lines.push('### Animations');
    for (const { value, count } of animations.animations) {
      lines.push(`- \`${value}\` (${count}x)`);
    }
    lines.push('');
  }

  if (animations.keyframeDetails?.length) {
    lines.push('### Keyframe Definitions');
    for (const kf of animations.keyframeDetails) {
      lines.push(`#### \`@keyframes ${kf.name}\``);
      for (const step of kf.steps) {
        lines.push(`- **${step.offset}**: ${step.properties.map(p => `\`${p}\``).join(', ')}`);
      }
      lines.push('');
    }
  }

  if (animations.willChange?.length) {
    lines.push('### Will-Change Hints');
    for (const { value, count } of animations.willChange) {
      lines.push(`- \`${value}\` (${count}x)`);
    }
    lines.push('');
  }

  if (animations.scrollAnimated?.length) {
    lines.push('### Scroll-Triggered Animations');
    for (const { selector, count } of animations.scrollAnimated) {
      lines.push(`- \`${selector}\`: ${count} element${count > 1 ? 's' : ''}`);
    }
    lines.push('');
  }

  // ──────────── Design Tokens ────────────
  if (data.tokens && data.tokens.totalTokenCount > 0) {
    lines.push('---');
    lines.push(`## Design Tokens (${data.tokens.totalTokenCount} CSS custom properties)`);
    lines.push('');

    if (data.tokens.meta.themeColor) {
      lines.push(`- **Theme Color**: \`${data.tokens.meta.themeColor}\``);
    }
    if (data.tokens.meta.colorScheme) {
      lines.push(`- **Color Scheme**: \`${data.tokens.meta.colorScheme}\``);
    }
    if (data.tokens.hasDarkMode) {
      lines.push('- **Dark Mode**: Detected');
    }
    lines.push('');

    function renderTokenTable(title, tokenObj) {
      const entries = Object.entries(tokenObj);
      if (!entries.length) return;
      lines.push(`### ${title}`);
      lines.push('| Token | Value |');
      lines.push('|-------|-------|');
      for (const [name, value] of entries.slice(0, 20)) {
        lines.push(`| \`${name}\` | \`${value}\` |`);
      }
      if (entries.length > 20) {
        lines.push(`| ... | *(${entries.length - 20} more)* |`);
      }
      lines.push('');
    }

    renderTokenTable('Color Tokens', data.tokens.colorTokens);
    renderTokenTable('Spacing Tokens', data.tokens.spacingTokens);
    renderTokenTable('Typography Tokens', data.tokens.typographyTokens);
    renderTokenTable('Radius Tokens', data.tokens.radiusTokens);
    renderTokenTable('Shadow Tokens', data.tokens.shadowTokens);
    renderTokenTable('Motion Tokens', data.tokens.motionTokens);

    renderTokenTable('Other Tokens', data.tokens.otherTokens);
  }

  // ──────────── Assets ────────────
  lines.push('---');
  lines.push('## Assets');
  lines.push('');

  if (assets.favicon) {
    lines.push('### Favicon');
    lines.push(`- ${assets.favicon}`);
    lines.push('');
  }

  if (assets.logos.length) {
    lines.push('### Logos');
    for (const logo of assets.logos) {
      lines.push(`- ${logo}`);
    }
    lines.push('');
  }

  if (assets.heroImages.length) {
    lines.push('### Hero / Key Images');
    for (const img of assets.heroImages) {
      lines.push(`- ${img.src} (${img.width}x${img.height}${img.alt ? `, alt: "${img.alt}"` : ''})`);
    }
    lines.push('');
  }

  if (assets.icons) {
    lines.push('### Icons');
    lines.push(`- SVG icons found: ${assets.icons.svgIconCount}`);
    if (assets.icons.iconFontFamilies.length) {
      lines.push(`- Icon font families: ${assets.icons.iconFontFamilies.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
