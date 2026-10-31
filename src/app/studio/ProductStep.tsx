"use client";

import type { ReactNode } from "react";
import type { StudioProduct } from "@/lib/studio";

export type ProductChoice = "tauvel" | "upload";

interface ProductStepProps {
  product: StudioProduct;
  choice: ProductChoice;
  onChoice: (choice: ProductChoice) => void;
  /** The upload flow, shown when the visitor brings their own product. */
  uploadPanel: ReactNode;
  showProtect: boolean;
  onShowProtect: (show: boolean) => void;
  protectConfirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export function ProductStep({ product, choice, onChoice, uploadPanel, showProtect, onShowProtect, protectConfirmed, onConfirm }: ProductStepProps) {
  const share = product.protectedShare === null ? null : (product.protectedShare * 100).toFixed(1);

  return (
    <section className="step" aria-labelledby="product-heading">
      <h1 id="product-heading" className="step-title">
        Product
      </h1>
      <p className="step-lede">Mark what can never change. No model is trusted to redraw the label; every creative gets it back from this photo.</p>
      <div className="segmented" role="radiogroup" aria-label="Product">
        <button type="button" role="radio" aria-checked={choice === "tauvel"} onClick={() => onChoice("tauvel")}>Tauvel sample</button>
        <button type="button" role="radio" aria-checked={choice === "upload"} onClick={() => onChoice("upload")}>Your product</button>
      </div>
      {choice === "upload" ? (
        uploadPanel
      ) : (
      <>
      <h2 className="step-subtitle">{product.name}</h2>
      <p className="hint">{product.description}</p>

      {product.protectMaskUrl ? (
        <div className="protect-block">
          <p className="protect-legend">Protected: {share}% of the photo, the gold foil glyphs</p>
          <p className="hint">Glyph-shaped, not a box, so a relit sleeve never leaves an unlit rectangle around the text.</p>
          <button className="chip" type="button" aria-pressed={showProtect} onClick={() => onShowProtect(!showProtect)}>
            {showProtect ? "Hide protected region" : "Show protected region"}
          </button>
          <label className="check">
            <input type="checkbox" checked={protectConfirmed} onChange={(event) => onConfirm(event.target.checked)} />
            Protect this region in every creative
          </label>
        </div>
      ) : (
        <p className="notice">This product has no protect mask yet, so recipes are locked.</p>
      )}

      {product.reveal && (
        <div className="field">
          <span className="field-label">Reveal keyframes</span>
          <div className="keyframes">
            <figure>
              <img src={product.reveal.startUrl} alt="Closed sleeve, first keyframe" loading="lazy" />
              <figcaption>First frame</figcaption>
            </figure>
            <figure>
              <img src={product.reveal.endUrl} alt="Bar out of the sleeve, last keyframe" loading="lazy" />
              <figcaption>Last frame</figcaption>
            </figure>
          </div>
          <span className="hint">A closed and an opened shot unlock the Reveal recipe.</span>
        </div>
      )}
      </>
      )}
    </section>
  );
}
