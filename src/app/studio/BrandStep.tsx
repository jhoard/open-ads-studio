"use client";

import { useState, type FormEvent } from "react";
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
    setNotice(cached ? null : "Live crawling is not enabled in this build, so the cached Tauvel kit loaded instead.");
    onLoad();
  };

  return (
    <section className="step" aria-labelledby="brand-heading">
      <h1 id="brand-heading" className="step-title">
        Brand
      </h1>
      <p className="step-lede">Paste a brand website. Its palette, type, tone and logo become the kit every creative follows.</p>
      <form className="field" onSubmit={extract}>
        <label htmlFor="brand-url">Brand website</label>
        <div className="inline-form">
          <input id="brand-url" type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourbrand.com" />
          <button className="button" type="submit">
            {loaded ? "Reload" : "Load kit"}
          </button>
        </div>
      </form>
      {notice && <p className="notice">{notice}</p>}

      {loaded && (
        <>
          <div className="field">
            <label htmlFor="brand-tagline">Tagline</label>
            <input id="brand-tagline" value={brand.tagline} onChange={(event) => onChange({ ...brand, tagline: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="brand-tone">Tone</label>
            <textarea id="brand-tone" value={brand.tone} onChange={(event) => onChange({ ...brand, tone: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="brand-audience">Audience</label>
            <textarea id="brand-audience" value={brand.audience} onChange={(event) => onChange({ ...brand, audience: event.target.value })} />
          </div>
          <p className="hint">
            Type: {brand.typography.display}, with {brand.typography.supporting.toLowerCase()}.
          </p>
        </>
      )}
    </section>
  );
}
