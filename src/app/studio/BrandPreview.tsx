"use client";

import type { CSSProperties } from "react";
import type { BrandKit } from "@/lib/brand-kit";

function kitFont(kit: BrandKit): string {
  if (kit.source === "cached") return "var(--font-display)";
  const family = kit.typography.display.split(",")[0]?.trim();
  return family ? `"${family}", var(--font-ui)` : "var(--font-ui)";
}

function Mark({ kit }: { kit: BrandKit }) {
  if (kit.logoKind === "mask" && kit.logoUrl) {
    return <div className="brand-lockup-mark" style={{ "--logo-url": `url(${kit.logoUrl})` } as CSSProperties} role="img" aria-label={`${kit.name} logo`} />;
  }
  if (kit.logoUrl) {
    return <img className="brand-lockup-logo" src={kit.logoUrl} alt={`${kit.name} logo`} referrerPolicy="no-referrer" />;
  }
  return <p className="brand-lockup-name">{kit.name}</p>;
}

/** A working identity sheet: primary mark, type specimen, then named color references. */
export function BrandPreview({ kit }: { kit: BrandKit }) {
  const scope = { "--kit-surface": kit.theme.surface, "--kit-accent": kit.theme.accent, "--kit-font": kitFont(kit) } as CSSProperties;
  return (
    <div className="brand-sheet" style={scope}>
      <section className="identity-sheet" aria-label={`${kit.name} primary identity`}>
        <div className="identity-sheet-heading"><h2 className="sheet-title"><span className="sheet-index">01</span>Identity</h2><span className="sheet-label">Primary mark</span></div>
        <div className="identity-mark"><Mark kit={kit} /></div>
        {kit.tagline && <p className="identity-tagline">{kit.tagline}</p>}
      </section>

      <div className="brand-sheet-details">
        <section className="type-sheet" aria-labelledby="type-sheet-heading">
          <h2 id="type-sheet-heading" className="sheet-title"><span className="sheet-index">02</span>Typography</h2>
          <p className="type-sheet-specimen" aria-hidden="true">Aa<span>Bb 123</span></p>
          <p className="type-sheet-name">{kit.source === "cached" ? "Gilda Display" : kit.typography.display.split(",")[0]}</p>
          <p className="type-sheet-description">{kit.typography.display}</p>
        </section>
        <section className="palette-sheet" aria-labelledby="palette-sheet-heading">
          <h2 id="palette-sheet-heading" className="sheet-title"><span className="sheet-index">03</span>Color palette</h2>
          <ul className="palette-sheet-list">
            {kit.palette.map((color) => (
              <li key={`${color.token}-${color.hex}`}>
                <span className="palette-sheet-swatch" style={{ background: color.hex }} aria-hidden="true" />
                <span className="palette-sheet-token">{color.token.replace(/-/g, " ")}</span>
                <span className="palette-sheet-hex">{color.hex}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {kit.heroImages.length > 0 && (
        <ul className="brand-lockup-heroes" aria-label="Reference images from the site">
          {kit.heroImages.map((src) => (
            <li key={src}><img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /></li>
          ))}
        </ul>
      )}
    </div>
  );
}
