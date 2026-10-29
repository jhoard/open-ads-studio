"use client";

import { useState, type CSSProperties } from "react";
import type { StudioProduct } from "@/lib/studio";

interface ProductStepProps {
  product: StudioProduct;
  protectConfirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export function ProductStep({ product, protectConfirmed, onConfirm }: ProductStepProps) {
  const [showProtect, setShowProtect] = useState(true);
  const overlayStyle = product.protectMaskUrl ? ({ "--mask-url": `url(${product.protectMaskUrl})` } as CSSProperties) : undefined;
  const share = product.protectedShare === null ? null : (product.protectedShare * 100).toFixed(1);

  return (
    <section className="panel" aria-labelledby="product-heading">
      <h2 id="product-heading">Product</h2>
      <p className="lede">
        Mark what can never change. The protected pixels are the label: monogram, wordmark and label copy. No model is trusted to redraw them; every creative gets them back from this photo.
      </p>
      <div className="split">
        <div>
          <div className="protect-view" data-protect={showProtect}>
            <img src={product.photoUrl} alt={`${product.name} packshot`} width={1122} height={1402} />
            {showProtect && overlayStyle && <div className="protect-overlay" style={overlayStyle} aria-hidden="true" />}
          </div>
          <div className="step-actions step-actions-start">
            <button className="chip" type="button" aria-pressed={showProtect} onClick={() => setShowProtect((value) => !value)}>
              {showProtect ? "Hide protected region" : "Show protected region"}
            </button>
          </div>
        </div>
        <div>
          <h3 className="flush">{product.name}</h3>
          <p className="hint">{product.description}</p>
          {product.protectMaskUrl ? (
            <>
              <p className="protect-legend">Protected: {share}% of the photo, the gold foil glyphs</p>
              <p className="hint">Glyph-shaped, not a box, so a relit sleeve never leaves an unlit rectangle around the text.</p>
              <label className="check">
                <input type="checkbox" checked={protectConfirmed} onChange={(event) => onConfirm(event.target.checked)} />
                Protect this region in every creative
              </label>
            </>
          ) : (
            <p className="notice">This product has no protect mask yet, so recipes are locked.</p>
          )}
          {product.reveal && (
            <>
              <h3>Reveal keyframes</h3>
              <p className="hint">A closed and an opened shot unlock the Reveal recipes.</p>
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}
