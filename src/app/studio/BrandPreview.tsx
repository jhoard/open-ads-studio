"use client";

import type { CSSProperties } from "react";
import type { BrandKit } from "@/lib/brand-kit";

/** The kit's display face for the specimen: the bundled Didone for Tauvel, else the extracted family name. */
function kitFont(kit: BrandKit): string {
  if (kit.source === "cached") return "var(--font-display)";
  const family = kit.typography.display.split(",")[0]?.trim();
  return family ? `"${family}", var(--font-ui)` : "var(--font-ui)";
}

function Mark({ kit }: { kit: BrandKit }) {
  // The single-source Tauvel mark is recolored with the kit accent; a crawled logo shows as served.
  if (kit.logoKind === "mask" && kit.logoUrl) {
    return <div className="brand-lockup-mark" style={{ "--logo-url": `url(${kit.logoUrl})` } as CSSProperties} role="img" aria-label={`${kit.name} logo`} />;
  }
  if (kit.logoUrl) {
    return <img className="brand-lockup-logo" src={kit.logoUrl} alt={`${kit.name} logo`} referrerPolicy="no-referrer" />;
  }
  return <p className="brand-lockup-name">{kit.name}</p>;
}

/**
 * The brand kit card: the one place outside the creatives where the brand's own colors and type appear.
 * Mark, tagline, palette, a type specimen, and any hero images found on the site.
 */
export function BrandPreview({ kit }: { kit: BrandKit }) {
  const scope = { "--kit-surface": kit.theme.surface, "--kit-accent": kit.theme.accent, "--kit-font": kitFont(kit) } as CSSProperties;
  return (
    <div className="brand-lockup" style={scope}>
      <Mark kit={kit} />
      {kit.tagline && <p className="brand-lockup-tagline">{kit.tagline}</p>}
      <ul className="brand-lockup-palette" aria-label="Palette">
        {kit.palette.map((color) => (
          <li key={`${color.token}-${color.hex}`} style={{ background: color.hex }} title={`${color.token} ${color.hex}`} />
        ))}
      </ul>
      <div className="brand-specimen" aria-label="Type specimen">
        <span className="brand-specimen-glyphs" aria-hidden="true">
          Aa Bb 123
        </span>
        <span className="brand-specimen-note">
          Display: {kit.typography.display}. Supporting: {kit.typography.supporting}.
        </span>
      </div>
      {kit.heroImages.length > 0 && (
        <ul className="brand-lockup-heroes" aria-label="Hero images from the site">
          {kit.heroImages.map((src) => (
            <li key={src}>
              <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
