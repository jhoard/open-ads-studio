"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useCreatives, type CreateRequest } from "@/lib/client/useCreatives";
import { DIRECTION_EXAMPLES } from "@/lib/directions";
import { findRecipe } from "@/lib/recipes";
import type { Creative, Objective, StudioData } from "@/lib/studio";
import type { ApiError } from "@/lib/types";
import { BrandPreview } from "./BrandPreview";
import { BrandStep } from "./BrandStep";
import { isReady, percent } from "./CreativeCard";
import { CreateStep, type CreatePreview } from "./CreateStep";
import { ExportStep } from "./ExportStep";
import { PreviewStage, type LabelReveal, type PreviewMedia } from "./PreviewStage";
import { ProductStep } from "./ProductStep";
import { ReviewStep, defaultCopy } from "./ReviewStep";
import { StepIcon } from "./icons";

const STEPS = [
  { id: "brand", name: "Brand" },
  { id: "product", name: "Product" },
  { id: "create", name: "Create" },
  { id: "review", name: "Review" },
  { id: "export", name: "Export" },
] as const;
const BRAND = 0;
const PRODUCT = 1;
const CREATE = 2;
const REVIEW = 3;
const EXPORT = 4;

interface Preview {
  media: PreviewMedia | null;
  title: string;
  detail?: string;
  reveal?: LabelReveal | null;
  revealKey?: string;
  empty?: string;
}

const hexOf = (brand: StudioData["brand"], token: string): string | undefined => brand.palette.find((color) => color.token === token)?.hex;

/** Once the kit loads, the studio wears the brand: its card color for surfaces, its foil for the accent. */
function brandTheme(brand: StudioData["brand"] | null, loaded: boolean): CSSProperties | undefined {
  if (!brand || !loaded) return undefined;
  const surface = hexOf(brand, "bottle-green") ?? brand.palette[0]?.hex;
  const accent = hexOf(brand, "brushed-gold") ?? brand.palette[1]?.hex;
  return { ...(surface ? { "--color-panel": surface } : {}), ...(accent ? { "--color-accent": accent } : {}) } as CSSProperties;
}

const mediaOf = (creative: Creative, raw: boolean): PreviewMedia => ({
  kind: creative.outputKind ?? "image",
  url: raw && creative.rawUrl ? creative.rawUrl : (creative.outputUrl as string),
  glyphsUrl: raw ? null : creative.glyphsUrl,
});

export function Studio() {
  const [data, setData] = useState<StudioData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brand, setBrand] = useState<StudioData["brand"] | null>(null);
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [protectConfirmed, setProtectConfirmed] = useState(false);
  const [showProtect, setShowProtect] = useState(true);
  const [step, setStep] = useState(0);
  const [createPreview, setCreatePreview] = useState<CreatePreview>({ recipe: "scene", directionId: undefined });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const studio = useCreatives();

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

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // A returning visitor with creatives already made has been through Brand and Protect.
  const hasCreatives = studio.creatives.length > 0;
  useEffect(() => {
    if (!hasCreatives) return;
    setBrandLoaded(true);
    setProtectConfirmed(true);
  }, [hasCreatives]);

  const onCreatePreview = useCallback((preview: CreatePreview) => setCreatePreview(preview), []);

  const unlocked = [true, brandLoaded, brandLoaded && protectConfirmed, hasCreatives, studio.approved.size > 0];
  const approvedCreatives = studio.creatives.filter((creative) => studio.approved.has(creative.id) && creative.outputUrl);
  const sceneSourceId = studio.creatives.find((creative) => !creative.demo && creative.stage === "scene-relight" && creative.status === "succeeded")?.id ?? null;
  const pool = step === EXPORT ? approvedCreatives : studio.creatives;
  const selected = pool.find((creative) => creative.id === selectedId) ?? pool[0] ?? null;

  const create = async (requests: CreateRequest[], objective: Objective): Promise<void> => {
    await studio.create(requests, objective);
    setSelectedId(null);
    setShowModel(false);
    setStep(REVIEW);
  };

  const select = (id: string): void => {
    setSelectedId(id);
    setShowModel(false);
  };

  const preview = useMemo((): Preview | null => {
    if (!data || !brand) return null;
    if (step === BRAND) return { media: null, title: brandLoaded ? brand.name : "Brand kit", detail: brandLoaded ? brand.tone : undefined };
    if (step === PRODUCT) {
      const share = data.product.protectedShare === null ? "" : `${(data.product.protectedShare * 100).toFixed(1)}% of the photo is protected`;
      return { media: { kind: "image", url: data.product.photoUrl }, title: data.product.name, detail: share };
    }
    if (step === CREATE) {
      const recipe = findRecipe(createPreview.recipe);
      if (!recipe) return null;
      const direction = brand.sceneDirections.find((entry) => entry.id === createPreview.directionId);
      const example = recipe.id === "scene" ? DIRECTION_EXAMPLES[createPreview.directionId ?? ""] : recipe.example;
      const title = recipe.id === "scene" && direction ? `${recipe.label}: ${direction.label}` : recipe.label;
      const detail = [...recipe.models, ...recipe.workflows].join(", ");
      if (!example) return { media: null, title, detail, empty: `${direction?.label ?? "This direction"} has no approved render yet. It still runs live.` };
      return { media: { kind: example.kind, url: example.url, posterUrl: example.posterUrl }, title, detail: example.labelMatch ? `${detail}. Label match ${percent(example.labelMatch)}` : detail };
    }
    if (!selected) return { media: null, title: step === REVIEW ? "Review" : "Export", empty: step === REVIEW ? "Make creatives in Create to review them here." : "Approve creatives in Review to export them." };
    if (!isReady(selected)) return { media: null, title: selected.label, empty: "Rendering on Comfy Cloud. The preview appears when it lands." };
    const raw = step === REVIEW && showModel;
    const scored = selected.labelMatch !== null && selected.modelLabelMatch !== null;
    return {
      media: mediaOf(selected, raw),
      title: raw ? `${selected.label}, model output before the label restore` : selected.label,
      detail: step === EXPORT ? `"${studio.copy[selected.id] ?? defaultCopy(selected, data.copyLines)}"` : undefined,
      reveal: step === REVIEW && scored && !raw ? { from: selected.modelLabelMatch as number, to: selected.labelMatch as number } : null,
      revealKey: selected.id,
    };
  }, [data, brand, brandLoaded, step, createPreview, selected, showModel, studio.copy]);

  const protectOverlay =
    step === PRODUCT && showProtect && data?.product.protectMaskUrl ? (
      <span className="protect-overlay" style={{ "--mask-url": `url(${data.product.protectMaskUrl})` } as CSSProperties} aria-hidden="true" />
    ) : undefined;

  return (
    <div className="shell" style={brandTheme(brand, brandLoaded)}>
      <nav className="rail" aria-label="Steps">
        <p className="rail-mark">Open Ads Studio</p>
        <ol>
          {STEPS.map((entry, index) => (
            <li key={entry.id}>
              <button type="button" disabled={!unlocked[index]} aria-current={index === step ? "step" : undefined} data-done={index < step} onClick={() => setStep(index)}>
                <StepIcon name={entry.id} />
                <span>{entry.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className="controls">
        {data && (
          <p className="mode-pill" data-mode={data.mode}>
            {data.mode === "demo" ? "Demo mode: example renders, no generation" : "Live on Comfy Cloud"}
          </p>
        )}
        {loadError && <p className="notice notice-error">{loadError}</p>}
        {data && brand ? (
          <>
            {step === BRAND && <BrandStep brand={brand} loaded={brandLoaded} onLoad={() => setBrandLoaded(true)} onChange={setBrand} />}
            {step === PRODUCT && <ProductStep product={data.product} showProtect={showProtect} onShowProtect={setShowProtect} protectConfirmed={protectConfirmed} onConfirm={setProtectConfirmed} />}
            {step === CREATE && (
              <CreateStep
                directions={brand.sceneDirections}
                available={{ "reveal-keyframes": data.mode === "demo" || data.product.reveal !== null, "scene-still": data.mode === "demo" || sceneSourceId !== null }}
                sceneSourceId={sceneSourceId}
                mode={data.mode}
                submitting={studio.submitting}
                error={studio.error}
                onPreview={onCreatePreview}
                onCreate={create}
              />
            )}
            {step === REVIEW && (
              <ReviewStep
                creatives={studio.creatives}
                selected={selected}
                approved={studio.approved}
                copy={studio.copy}
                copyLines={data.copyLines}
                safety={data.safety}
                showModel={showModel}
                onShowModel={setShowModel}
                onSelect={select}
                onCopyChange={studio.setCopy}
                onToggleApproved={studio.toggleApproved}
                onRemove={studio.remove}
              />
            )}
            {step === EXPORT && (
              <ExportStep
                creatives={approvedCreatives}
                selectedId={selected?.id ?? null}
                onSelect={select}
                copyFor={(creative: Creative) => studio.copy[creative.id] ?? defaultCopy(creative, data.copyLines)}
                safety={data.safety}
              />
            )}

            <div className="step-nav">
              {step > 0 && (
                <button className="button button-secondary" type="button" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              )}
              {step < STEPS.length - 1 && step !== CREATE && (
                <button className="button" type="button" disabled={!unlocked[step + 1]} onClick={() => setStep(step + 1)}>
                  Next: {STEPS[step + 1].name}
                </button>
              )}
            </div>
          </>
        ) : (
          !loadError && <p className="empty">Loading the studio</p>
        )}
      </main>

      {preview && (
        <PreviewStage
          media={preview.media}
          title={preview.title}
          detail={preview.detail}
          reveal={preview.reveal}
          revealKey={preview.revealKey}
          empty={preview.empty}
          overlay={protectOverlay}
          custom={step === BRAND && brand ? <BrandPreview brand={brand} loaded={brandLoaded} /> : undefined}
        />
      )}
    </div>
  );
}
