"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import type { StudioData } from "@/lib/studio";

type Brand = StudioData["brand"];

interface BrandStepProps {
  brand: Brand;
  loaded: boolean;
  onLoad: () => void;
  onChange: (brand: Brand) => void;
}

// The cached kit stands in for the Design Extractor's output; the live crawl does not run on serverless yet.
const CACHED_HOSTS = ["tauvel"];

export function BrandStep({ brand, loaded, onLoad, onChange }: BrandStepProps) {
  const [url, setUrl] = useState("tauvel.com");
  const [notice, setNotice] = useState<string | null>(null);

  const extract = (event: FormEvent): void => {
    event.preventDefault();
    const cached = CACHED_HOSTS.some((host) => url.toLowerCase().includes(host));
    setNotice(cached ? null : "Live crawling is not enabled in this build. Showing the cached Tauvel kit, made by the same extractor.");
    onLoad();
  };

  const logoStyle = { "--logo-url": `url(${brand.logoUrl})`, "--logo-color": brand.palette[0]?.hex } as CSSProperties;

  return (
    <section className="panel" aria-labelledby="brand-heading">
      <h2 id="brand-heading">Brand</h2>
      <p className="lede">Paste a brand URL. The Design Extractor reads its palette, type, tone and logo into a kit every creative follows. Every field stays editable.</p>
      <form className="field" onSubmit={extract}>
        <label htmlFor="brand-url">Brand website</label>
        <div className="inline-form">
          <input id="brand-url" type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourbrand.com" />
          <button className="button" type="submit">
            {loaded ? "Reload kit" : "Extract brand kit"}
          </button>
        </div>
      </form>
      {notice && <p className="notice">{notice}</p>}

      {loaded && (
        <div className="split">
          <div className="brand-card">
            <div className="brand-logo" style={logoStyle} role="img" aria-label={`${brand.name} logo`} />
            <p className="brand-name">{brand.name}</p>
            <div className="field">
              <label htmlFor="brand-tagline">Tagline</label>
              <input id="brand-tagline" value={brand.tagline} onChange={(event) => onChange({ ...brand, tagline: event.target.value })} />
            </div>
            <div>
              <p className="field-label">Typography</p>
              <p className="hint">
                Display: {brand.typography.display}. Supporting: {brand.typography.supporting}.
              </p>
            </div>
          </div>
          <div>
            <p className="field-label">Palette</p>
            <div className="swatches">
              {brand.palette.map((color) => (
                <div className="swatch" key={color.token}>
                  <span style={{ background: color.hex }} />
                  <p>
                    {color.token}
                    <br />
                    <code>{color.hex}</code>
                  </p>
                </div>
              ))}
            </div>
            <div className="field field-spaced">
              <label htmlFor="brand-tone">Tone</label>
              <textarea id="brand-tone" value={brand.tone} onChange={(event) => onChange({ ...brand, tone: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="brand-audience">Audience</label>
              <textarea id="brand-audience" value={brand.audience} onChange={(event) => onChange({ ...brand, audience: event.target.value })} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
