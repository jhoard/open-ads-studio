"use client";

import { useState, type FormEvent } from "react";
import { MASK_THRESHOLD, MAX_MASK_BOXES, type MaskBox } from "@/lib/glyph-mask";
import type { UseUploadedProduct } from "@/lib/client/useUploadedProduct";

// The Product step for your own product: upload, wait for the cutout, box the label, tune, save.

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

interface UploadPanelProps {
  uploads: UseUploadedProduct;
  live: boolean;
  boxes: MaskBox[];
  threshold: number;
  onBoxes: (boxes: MaskBox[]) => void;
  onThreshold: (threshold: number) => void;
  protectConfirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export function UploadPanel({ uploads, live, boxes, threshold, onBoxes, onThreshold, protectConfirmed, onConfirm }: UploadPanelProps) {
  const { product, busy, error } = uploads;
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalError("The photo is larger than 10 MB.");
      return;
    }
    setLocalError(null);
    void uploads.upload(file, name);
  };

  if (!live) {
    return <p className="notice">Your own product needs live generation, which is off right now. Tauvel works with the example renders.</p>;
  }

  if (!product) {
    return (
      <form className="upload-form" onSubmit={submit}>
        <p className="hint">A clear product photo on a plain background works best. PNG, JPEG or WebP, up to 10 MB. Location and camera data are removed on upload.</p>
        <label className="field">
          <span className="field-label">Product photo</span>
          <input type="file" accept={ACCEPT} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <label className="field">
          <span className="field-label">Product name</span>
          <input className="input" type="text" maxLength={60} value={name} placeholder="Your product" onChange={(event) => setName(event.target.value)} />
        </label>
        {(localError ?? error) && <p className="notice notice-error" role="alert">{localError ?? error}</p>}
        <button className="button" type="submit" disabled={!file || busy}>
          {busy ? "Uploading" : "Upload and cut out"}
        </button>
      </form>
    );
  }

  const share = product.protectedShare === null ? null : (product.protectedShare * 100).toFixed(1);
  return (
    <div className="upload-panel">
      <h2 className="step-subtitle">{product.name}</h2>
      {product.status === "cutting" && <p className="status-line" role="status"><span className="status-dot" aria-hidden="true" />Cutting the product out with BiRefNet on Comfy Cloud...</p>}
      {product.status === "failed" && <p className="notice notice-error" role="alert">{product.error}</p>}
      {product.status === "ready" && (
        <>
          <p className="hint">Drag boxes over the label and logo in the preview, up to {MAX_MASK_BOXES}. Inside each box, everything that stands out from the label&apos;s own background is protected and pasted back after generation.</p>
          <label className="field">
            <span className="field-label">Threshold: {threshold}</span>
            <input type="range" min={MASK_THRESHOLD.min} max={MASK_THRESHOLD.max} value={threshold} onChange={(event) => onThreshold(Number(event.target.value))} aria-describedby="threshold-hint" />
            <span id="threshold-hint" className="hint">Lower catches fainter print; higher keeps only bold type.</span>
          </label>
          <div className="inline-actions">
            <button className="chip" type="button" disabled={boxes.length === 0} onClick={() => onBoxes(boxes.slice(0, -1))}>Undo last box</button>
            <button className="chip" type="button" disabled={boxes.length === 0} onClick={() => onBoxes([])}>Clear boxes</button>
            <button className="button" type="button" disabled={boxes.length === 0 || busy} onClick={() => void uploads.saveMask(boxes, threshold)}>
              {busy ? "Saving" : "Save label mask"}
            </button>
          </div>
          {share !== null && <p className="protect-legend">Protected: {share}% of the photo, the label detail inside your boxes</p>}
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <label className="check">
            <input type="checkbox" checked={protectConfirmed} disabled={share === null} onChange={(event) => onConfirm(event.target.checked)} />
            Protect this region in every creative
          </label>
        </>
      )}
      <button className="link-button" type="button" onClick={uploads.forget}>Use a different photo</button>
    </div>
  );
}
