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
  cached: "Example brand kit",
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
    try {
      onKit(kitFromDesignMd(await file.text(), catalog));
      setNotice("Brand kit imported. Review the details below.");
      setError(null);
    } catch {
      setError("Could not read that brand kit. Choose a readable DESIGN.md file and try again.");
    }
  };

  const toggleDirection = (direction: SceneDirection): void => {
    const has = kit.sceneDirections.some((entry) => entry.id === direction.id);
    const next = has ? kit.sceneDirections.filter((entry) => entry.id !== direction.id) : catalog.filter((entry) => entry.id === direction.id || kit.sceneDirections.some((own) => own.id === entry.id));
    if (next.length > 0) {
      onKit({ ...kit, sceneDirections: next });
      setNotice(null);
    } else {
      setNotice("Keep at least one scene direction selected.");
    }
  };

  return (
    <section className="step" aria-labelledby="brand-heading">
      <h1 id="brand-heading" className="step-title">
        Set up your brand
      </h1>
      <p className="step-lede">Start with a website or use the example kit below. Review the details that will guide your creatives.</p>

      <details className="form-section brand-import">
      <summary><span>Import a different brand</span><span className="optional-label">Website or .md file</span></summary>
      <form className="field" onSubmit={extract} aria-busy={busy}>
        <label htmlFor="brand-url">Brand website</label>
        <div className="inline-form">
          <input id="brand-url" type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourbrand.com" autoComplete="url" spellCheck={false} aria-describedby="brand-url-help" aria-invalid={error ? true : undefined} disabled={busy} />
          <button className="button" type="submit" disabled={busy || !url.trim()}>
            {busy ? "Extracting" : "Extract"}
          </button>
        </div>
        <p id="brand-url-help" className="hint">Extract colors, logo and typography from a public website.</p>
        <div className="link-row">
          <button className="link-button" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
            Upload a brand kit (.md)
          </button>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".md,text/markdown,text/plain" onChange={importFile} tabIndex={-1} aria-hidden="true" />
        </div>
      </form>
      {busy && (
        <p className="notice" role="status">
          Reading brand details from {url}. This usually takes 10 to 40 seconds.
        </p>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      </details>

      <section className="form-section" aria-labelledby="brand-kit-heading">
      <div className="kit-head">
        <div>
          <h2 id="brand-kit-heading" className="step-subtitle">{kit.name}</h2>
          <p className="hint">{SOURCE_LABEL[kit.source]}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => download(kit)}>
          Download kit
        </button>
      </div>

      <p className="hint">Edit your brand voice. Changes appear in the preview.</p>
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
      </section>
      <fieldset className="form-section scene-directions" aria-describedby="scene-directions-help">
        <legend>Scene directions</legend>
        <p className="hint" id="scene-directions-help">Choose one or more settings for your product.</p>
        <div className="field">
        <div className="chips" role="group" aria-label="Scene directions in this kit">
          {catalog.map((direction) => (
            <button key={direction.id} type="button" className="chip" aria-pressed={kit.sceneDirections.some((entry) => entry.id === direction.id)} onClick={() => toggleDirection(direction)}>
              <span className="chip-check" aria-hidden="true">{kit.sceneDirections.some((entry) => entry.id === direction.id) ? "✓" : "+"}</span>
              {direction.label}
            </button>
          ))}
        </div>
        <span className="hint">At least one direction must stay selected. You can choose a specific setting when creating.</span>
      </div>
      </fieldset>
    </section>
  );
}
