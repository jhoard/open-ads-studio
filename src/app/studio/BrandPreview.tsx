"use client";

import type { CSSProperties } from "react";
import type { StudioData } from "@/lib/studio";

/** The brand kit as a lockup: logo on its own ground, tagline in the display face, palette underneath. */
export function BrandPreview({ brand, loaded }: { brand: StudioData["brand"]; loaded: boolean }) {
  if (!loaded) return <p className="preview-empty">Paste a brand website to load its kit.</p>;
  const logoStyle = { "--logo-url": `url(${brand.logoUrl})` } as CSSProperties;
  return (
    <div className="brand-lockup">
      <div className="brand-lockup-mark" style={logoStyle} role="img" aria-label={`${brand.name} logo`} />
      <p className="brand-lockup-tagline">{brand.tagline}</p>
      <ul className="brand-lockup-palette" aria-label="Palette">
        {brand.palette.map((color) => (
          <li key={color.token} style={{ background: color.hex }} title={`${color.token} ${color.hex}`} />
        ))}
      </ul>
    </div>
  );
}
