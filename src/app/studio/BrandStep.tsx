"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { kitFromDesignMd, namePalette, pickTheme, readBrand, restoreKit, safeWebUrl, toDesignMd, type BrandKit } from "@/lib/brand-kit";
import type { SceneDirection } from "@/lib/types";

interface BrandStepProps {
  kit: BrandKit;
  catalog: SceneDirection[];
  onKit: (kit: BrandKit) => void;
  sample: BrandKit;
}

const MAX_IMPORT_BYTES = 512 * 1024;
const SOURCE_LABEL: Record<BrandKit["source"], string> = {
  empty: "Enter your website or upload a brand .md to start",
  cached: "Preloaded kit",
  crawl: "Extracted from the site",
  import: "Imported from Markdown",
};

function download(kit: BrandKit): void {
  const url = URL.createObjectURL(new Blob([toDesignMd(kit)], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "DESIGN.md";
  link.click();
  URL.revokeObjectURL(url);
}

export function BrandStep({ kit, catalog, onKit, sample }: BrandStepProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  let valid = false;
  try { readBrand(kit); valid = kit.source !== "empty"; } catch { /* Keep invalid edits visible until corrected. */ }

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
      onKit(restoreKit(body.kit));
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
    setNotice(null);
    setError(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError("That file is larger than 512 KB. Choose a smaller brand .md file.");
      return;
    }
    try {
      onKit(restoreKit(kitFromDesignMd(await file.text(), catalog)));
      setNotice("Brand kit imported. Review the details below.");
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not read that brand kit. Choose a readable .md file and try again.");
    }
  };

  const toggleDirection = (direction: SceneDirection): void => {
    const has = kit.sceneDirections.some((entry) => entry.id === direction.id);
    const next = has ? kit.sceneDirections.filter((entry) => entry.id !== direction.id) : [...kit.sceneDirections, direction];
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
        Brand kit
      </h1>
      <p className="step-lede">Enter your website or upload your brand&apos;s .md file. Review the extracted kit, then add your product.</p>

      <details className="form-section brand-import" open>
      <summary><span>Import brand</span><span className="optional-label">URL / .md</span></summary>
      <form className="field" onSubmit={extract} aria-busy={busy}>
        <label htmlFor="brand-url">Brand website</label>
        <div className="inline-form">
          <input id="brand-url" type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourbrand.com" autoComplete="url" spellCheck={false} aria-describedby="brand-url-help" aria-invalid={error ? true : undefined} disabled={busy} />
          <button className="button" type="submit" disabled={busy || !url.trim()}>
            {busy ? "Extracting" : "Import website"}
          </button>
        </div>
        <p id="brand-url-help" className="hint">Extract colors, logo and typography from a public website.</p>
        <div className="link-row">
          <button className="link-button" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
            Upload a brand kit (.md)
          </button>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".md,text/markdown,text/plain" onChange={importFile} tabIndex={-1} aria-hidden="true" />
        </div>
        <p className="hint">Markdown can include your brand name, hex colors, display and body fonts, tone and audience. No special filename needed.</p>
        <button className="link-button" type="button" disabled={busy} onClick={() => { onKit(sample); setNotice("Tauvel sample loaded. Import your brand at any time."); setError(null); }}>Try the Tauvel demo instead</button>
      </form>
      {busy && (
        <p className="notice" role="status">
          Reading brand details from {url}. This usually takes 10 to 40 seconds.
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      </details>
      {notice && <p className="notice" role="status">{notice}</p>}

      {kit.source !== "empty" && <>
      <section className="active-kit" aria-labelledby="brand-kit-heading">
        <div className="kit-head">
          <div>
            <p className="section-eyebrow">Active brand</p>
            <h2 id="brand-kit-heading" className="step-subtitle">{kit.name}</h2>
            <p className="hint">{SOURCE_LABEL[kit.source]}</p>
          </div>
          <button className="button button-secondary" type="button" disabled={!valid} onClick={() => download(kit)}>
            Download kit
          </button>
        </div>
      </section>

      <section className="editor-group" aria-labelledby="brand-voice-heading">
        <header className="editor-group-heading">
          <h2 id="brand-voice-heading">Brand voice</h2>
          <p>Set the message, tone and audience for your creatives.</p>
        </header>
        <div className="field">
          <label htmlFor="brand-name">Brand name</label>
          <input id="brand-name" maxLength={100} value={kit.name} onChange={(event) => onKit({ ...kit, name: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="brand-logo">Logo URL</label>
          <input id="brand-logo" type="url" maxLength={1000} value={kit.logoUrl} placeholder="https://yourbrand.com/logo.png" onChange={(event) => onKit({ ...kit, logo: safeWebUrl(event.target.value), logoUrl: event.target.value, logoKind: "image" })} />
          <span className="hint">If the logo cannot be read, exports use your brand name.</span>
        </div>
        <div className="field">
          <label htmlFor="brand-colors">Palette (hex colors separated by commas)</label>
          <input id="brand-colors" key={`${kit.id}-${kit.source}-${kit.palette.map((color) => color.hex).join()}`} defaultValue={kit.palette.map((color) => color.hex).join(", ")} onBlur={(event) => {
            const hexes = event.target.value.split(/[,\s]+/).filter(Boolean);
            onKit({ ...kit, palette: namePalette(hexes), theme: pickTheme(hexes) });
            setError(hexes.length > 6 || hexes.some((hex) => !/^#[0-9a-f]{6}$/i.test(hex)) ? "Use up to six colors, such as #224466, #ffffff." : null);
          }} />
        </div>
        {(["display", "supporting"] as const).map((role) => <div className="field" key={role}>
          <label htmlFor={`brand-font-${role}`}>{role === "display" ? "Display font" : "Body font"}</label>
          <input id={`brand-font-${role}`} maxLength={300} value={kit.typography[role]} onChange={(event) => onKit({ ...kit, typography: { ...kit.typography, [role]: event.target.value } })} />
        </div>)}
        <div className="field">
          <label htmlFor="brand-tagline">Tagline</label>
          <input id="brand-tagline" maxLength={140} value={kit.tagline} onChange={(event) => onKit({ ...kit, tagline: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="brand-tone">Tone of voice</label>
          <textarea id="brand-tone" maxLength={2000} rows={4} value={kit.tone} placeholder="How the brand sounds, in a sentence or two" onChange={(event) => onKit({ ...kit, tone: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="brand-audience">Target audience</label>
          <textarea id="brand-audience" maxLength={2000} rows={3} value={kit.audience} placeholder="Who buys it, and when" onChange={(event) => onKit({ ...kit, audience: event.target.value })} />
        </div>
      </section>
      <fieldset className="editor-group scene-directions" aria-describedby="scene-directions-help">
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
      <section className="editor-group" aria-label="Edit scene settings">
        <p className="hint">Adapt the settings to your product. Remove props that do not belong to your brand.</p>
        {kit.sceneDirections.map((direction) => <fieldset key={direction.id} className="field">
          <legend>{direction.label}</legend>
          {(["surface", "props", "light"] as const).map((field) => <label className="field" key={field}>
            <span>{field === "surface" ? "Surface" : field === "props" ? "Props" : "Lighting"}</span>
            <textarea rows={2} maxLength={1000} value={direction[field]} onChange={(event) => onKit({ ...kit, sceneDirections: kit.sceneDirections.map((entry) => entry.id === direction.id ? { ...entry, [field]: event.target.value } : entry) })} />
          </label>)}
        </fieldset>)}
      </section>
      </>}
    </section>
  );
}
