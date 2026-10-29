"use client";

import { useEffect, useState } from "react";
import { useCreatives, type CreateRequest } from "@/lib/client/useCreatives";
import type { Creative, Objective, StudioData } from "@/lib/studio";
import type { ApiError } from "@/lib/types";
import { BrandStep } from "./BrandStep";
import { CreateStep } from "./CreateStep";
import { ExportStep } from "./ExportStep";
import { ProductStep } from "./ProductStep";
import { ReviewStep, defaultCopy } from "./ReviewStep";

const STEPS = ["Brand", "Product", "Create", "Review", "Export"] as const;
const CREATE_STEP = 2;
const REVIEW_STEP = 3;

export function Studio() {
  const [data, setData] = useState<StudioData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brand, setBrand] = useState<StudioData["brand"] | null>(null);
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [protectConfirmed, setProtectConfirmed] = useState(false);
  const [step, setStep] = useState(0);
  const studio = useCreatives();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => (await response.json()) as StudioData | ApiError)
      .then((body) => {
        if ("error" in body) {
          setLoadError(body.error);
          return;
        }
        setData(body);
        setBrand(body.brand);
      })
      .catch(() => setLoadError("Could not reach the server."));
  }, []);

  // A returning visitor with creatives already made has been through Brand and Protect.
  const hasCreatives = studio.creatives.length > 0;
  useEffect(() => {
    if (!hasCreatives) return;
    setBrandLoaded(true);
    setProtectConfirmed(true);
  }, [hasCreatives]);

  const unlocked = [true, brandLoaded, brandLoaded && protectConfirmed, hasCreatives, studio.approved.size > 0];
  const canAdvance = step < STEPS.length - 1 && unlocked[step + 1];
  const approvedCreatives = studio.creatives.filter((creative) => studio.approved.has(creative.id) && creative.outputUrl);

  const create = async (requests: CreateRequest[], objective: Objective): Promise<void> => {
    await studio.create(requests, objective);
    setStep(REVIEW_STEP);
  };

  return (
    <main className="studio">
      <header className="studio-header">
        <div>
          <h1>Open Ads Studio</h1>
          <p>Label-exact ads from one packshot. Open weights, ComfyUI workflows.</p>
        </div>
        {data && (
          <span className="mode-pill" data-mode={data.mode}>
            {data.mode === "demo" ? "Demo mode: example renders" : "Live: Comfy Cloud"}
          </span>
        )}
      </header>

      <nav aria-label="Steps">
        <ol className="stepper">
          {STEPS.map((name, index) => (
            <li key={name}>
              <button
                type="button"
                disabled={!unlocked[index]}
                aria-current={index === step ? "step" : undefined}
                data-done={index < step}
                onClick={() => setStep(index)}
              >
                <span className="step-number">0{index + 1}</span>
                <span className="step-name">{name}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {loadError && <p className="notice notice-error">{loadError}</p>}
      {data && brand ? (
        <>
          {step === 0 && <BrandStep brand={brand} loaded={brandLoaded} onLoad={() => setBrandLoaded(true)} onChange={setBrand} />}
          {step === 1 && <ProductStep product={data.product} protectConfirmed={protectConfirmed} onConfirm={setProtectConfirmed} />}
          {step === CREATE_STEP && (
            <CreateStep
              recipes={data.recipes}
              directions={brand.sceneDirections}
              hasReveal={data.product.reveal !== null}
              mode={data.mode}
              submitting={studio.submitting}
              error={studio.error}
              onCreate={create}
            />
          )}
          {step === REVIEW_STEP && (
            <ReviewStep
              creatives={studio.creatives}
              approved={studio.approved}
              copy={studio.copy}
              copyLines={data.copyLines}
              safety={data.safety}
              onCopyChange={studio.setCopy}
              onToggleApproved={studio.toggleApproved}
              onRemove={studio.remove}
            />
          )}
          {step === 4 && (
            <ExportStep
              creatives={approvedCreatives}
              copyFor={(creative: Creative) => studio.copy[creative.id] ?? defaultCopy(creative, data.copyLines)}
              safety={data.safety}
            />
          )}

          <div className="step-actions">
            {step > 0 && (
              <button className="button button-secondary" type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            {step < STEPS.length - 1 && step !== CREATE_STEP && (
              <button className="button" type="button" disabled={!canAdvance} onClick={() => setStep(step + 1)}>
                Next: {STEPS[step + 1]}
              </button>
            )}
          </div>
        </>
      ) : (
        !loadError && <p className="empty">Loading the studio</p>
      )}
    </main>
  );
}
