"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { kitFromDesignMd, toDesignMd, type BrandKit } from "@/lib/brand-kit";
import type { SceneDirection } from "@/lib/types";

interface BrandStepProps {
  kit: BrandKit;
  catalog: SceneDirection[];
  onKit: (kit: BrandKit) => void;
}

const MAX_IMPORT_BYTES = 512 * 1024;
const SOURCE_LABEL: Record<BrandKit["source"], string> = {
  cached: "Cached kit",
  crawl: "Extracted from the site",
  import: "Imported from DESIGN.md",
};

function download(kit: BrandKit): void {
  const url = URL.createObjectURL(new Blob([toDesignMd(kit)], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "DESIGN.md";
  link.click();
  URL.revokeObjectURL(url);
}

export function BrandStep({ kit, catalog, onKit }: BrandStepProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const extract = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const body = (await response.json()) as { kit?: BrandKit; notice?: string | null; error?: string };
      if (!response.ok || !body.kit) {
        setError(body.error ?? `The extractor returned ${response.status}.`);
        return;
      }
      onKit(body.kit);
      setNotice(body.notice ?? null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("That file is larger than 512 KB. A DESIGN.md is usually a few KB.");
      return;
    }
    onKit(kitFromDesignMd(await file.text(), catalog));
    setNotice(null);
    setError(null);
  };

  const toggleDirection = (direction: SceneDirection): void => {
    const has = kit.sceneDirections.some((entry) => entry.id === direction.id);
    const next = has ? kit.sceneDirections.filter((entry) => entry.id !== direction.id) : catalog.filter((entry) => entry.id === direction.id || kit.sceneDirections.some((own) => own.id === entry.id));
    if (next.length > 0) onKit({ ...kit, sceneDirections: next });
  };

  return (
    <section className="step" aria-labelledby="brand-heading">
      <h1 id="brand-heading" className="step-title">
        Brand
      </h1>
      <p className="step-lede">Paste a brand website. The Design Extractor reads its palette, type, logo and hero images into the kit every creative follows.</p>

      <form className="field" onSubmit={extract}>
        <label htmlFor="brand-url">Brand website</label>
        <div className="inline-form">
          <input id="brand-url" type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourbrand.com" disabled={busy} />
          <button className="button" type="submit" disabled={busy || !url.trim()}>
            {busy ? "Extracting" : "Extract"}
          </button>
        </div>
        <div className="link-row">
          <button className="link-button" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
            Import DESIGN.md
          </button>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".md,text/markdown,text/plain" onChange={importFile} tabIndex={-1} aria-hidden="true" />
        </div>
      </form>
      {busy && (
        <p className="notice" role="status">
          Crawling {url} in a headless browser. This takes 10 to 40 seconds.
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <div className="kit-head">
        <div>
          <h2 className="step-subtitle">{kit.name}</h2>
          <p className="hint">{SOURCE_LABEL[kit.source]}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => download(kit)}>
          Download DESIGN.md
        </button>
      </div>

      <div className="field">
        <label htmlFor="brand-tagline">Tagline</label>
        <input id="brand-tagline" value={kit.tagline} onChange={(event) => onKit({ ...kit, tagline: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="brand-tone">Tone</label>
        <textarea id="brand-tone" value={kit.tone} placeholder="How the brand sounds, in a sentence or two" onChange={(event) => onKit({ ...kit, tone: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="brand-audience">Audience</label>
        <textarea id="brand-audience" value={kit.audience} placeholder="Who buys it, and when" onChange={(event) => onKit({ ...kit, audience: event.target.value })} />
      </div>
      <div className="field">
        <span className="field-label">Scene directions</span>
        <div className="chips" role="group" aria-label="Scene directions in this kit">
          {catalog.map((direction) => (
            <button key={direction.id} type="button" className="chip" aria-pressed={kit.sceneDirections.some((entry) => entry.id === direction.id)} onClick={() => toggleDirection(direction)}>
              {direction.label}
            </button>
          ))}
        </div>
        <span className="hint">Started from the palette: dark-dominant brands get the dark sets, light-dominant ones linen and travertine.</span>
      </div>
      <p className="hint">
        Type: {kit.typography.display}. Supporting: {kit.typography.supporting}.
      </p>
    </section>
  );
}
