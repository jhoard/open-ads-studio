"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BrandKit } from "@/lib/brand-kit";
import { useCreatives, type CreateRequest } from "@/lib/client/useCreatives";
import { DIRECTION_EXAMPLES } from "@/lib/directions";
import { findRecipe } from "@/lib/recipes";
import { distinctReviewCreatives, reviewCreativeKey } from "@/lib/review-creatives";
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
  comparison?: { beforeUrl: string } | null;
}

const mediaOf = (creative: Creative, raw: boolean): PreviewMedia => ({
  kind: creative.outputKind ?? "image",
  url: raw && creative.rawUrl ? creative.rawUrl : (creative.outputUrl as string),
  glyphsUrl: raw ? null : creative.glyphsUrl,
});

export function Studio() {
  const [data, setData] = useState<StudioData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [protectConfirmed, setProtectConfirmed] = useState(false);
  const [showProtect, setShowProtect] = useState(true);
  const [step, setStep] = useState(0);
  const [createPreview, setCreatePreview] = useState<CreatePreview>({ recipe: "scene", directionId: undefined });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const studio = useCreatives();
  const controlsRef = useRef<HTMLElement>(null);
  const previousStep = useRef(step);

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
    if (previousStep.current === step) return;
    previousStep.current = step;
    controlsRef.current?.scrollTo({ top: 0 });
    const heading = controlsRef.current?.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  // A returning visitor with creatives already made has been through Protect.
  const reviewCreatives = distinctReviewCreatives(studio.creatives, studio.copy, studio.approved);
  const hasCreatives = reviewCreatives.length > 0;
  useEffect(() => {
    if (hasCreatives) setProtectConfirmed(true);
  }, [hasCreatives]);

  const onCreatePreview = useCallback((preview: CreatePreview) => setCreatePreview(preview), []);

  // Tauvel is preloaded, so Product is open from the start.
  const unlocked = [true, true, protectConfirmed, hasCreatives, studio.approved.size > 0];
  const approvedCreatives = reviewCreatives.filter((creative) => studio.approved.has(creative.id) && creative.outputUrl);
  const sceneSourceId = studio.creatives.find((creative) => !creative.demo && creative.stage === "scene-relight" && creative.status === "succeeded")?.id ?? null;
  const pool = step === EXPORT ? approvedCreatives : reviewCreatives;
  const selected = pool.find((creative) => creative.id === selectedId) ?? pool[0] ?? null;

  const create = async (requests: CreateRequest[], objective: Objective): Promise<void> => {
    await studio.create(requests, objective);
    setSelectedId(null);
    setStep(REVIEW);
  };

  const select = (id: string): void => {
    setSelectedId(id);
  };

  const matchingReviewIds = (id: string): string[] => {
    const creative = studio.creatives.find((entry) => entry.id === id);
    if (!creative) return [];
    const key = reviewCreativeKey(creative, studio.copy);
    return [...new Set(studio.creatives.filter((entry) => reviewCreativeKey(entry, studio.copy) === key).map((entry) => entry.id))];
  };

  const toggleReviewApproval = (id: string): void => {
    const nextApproved = !studio.approved.has(id);
    for (const match of matchingReviewIds(id)) {
      if (studio.approved.has(match) !== nextApproved) studio.toggleApproved(match);
    }
  };

  const removeReview = (id: string): void => {
    for (const match of matchingReviewIds(id)) studio.remove(match);
  };

  const preview = useMemo((): Preview | null => {
    if (!data || !brand) return null;
    if (step === BRAND) return { media: null, title: brand.name, detail: "Identity reference" };
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
    const comparing = step === REVIEW && Boolean(selected.rawUrl);
    const scored = selected.labelMatch !== null && selected.modelLabelMatch !== null;
    return {
      media: mediaOf(selected, false),
      comparison: comparing ? { beforeUrl: selected.rawUrl as string } : null,
      title: selected.label,
      detail: step === EXPORT ? `"${studio.copy[selected.id] ?? defaultCopy(selected, data.copyLines)}"` : undefined,
      reveal: step === REVIEW && scored && !comparing ? { from: selected.modelLabelMatch as number, to: selected.labelMatch as number } : null,
      revealKey: selected.id,
    };
  }, [data, brand, step, createPreview, selected, studio.copy]);

  const protectOverlay =
    step === PRODUCT && showProtect && data?.product.protectMaskUrl ? (
      <span className="protect-overlay" style={{ "--mask-url": `url(${data.product.protectMaskUrl})` } as CSSProperties} aria-hidden="true" />
    ) : undefined;

  return (
    <div className="shell">
      <a className="skip-link" href="#studio-editor">Skip to editor</a>
      <nav className="rail" aria-label="Creative workflow">
        <p className="rail-mark" aria-label="Open Ads Studio">
          <span>Open Ads<span className="wordmark-dot" aria-hidden="true">.</span></span>
          <span className="rail-subtitle">Studio</span>
        </p>
        <span className="rail-section-label">Workspace</span>
        <ol>
          {STEPS.map((entry, index) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-disabled={!unlocked[index]}
                aria-current={index === step ? "step" : undefined}
                aria-describedby={!unlocked[index] ? `step-${entry.id}-reason` : undefined}
                onClick={() => { if (unlocked[index]) setStep(index); }}
              >
                <span className="step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="step-name">{entry.name}</span>
                <span className="visually-hidden">{index === step ? ", current step" : !unlocked[index] ? ", unavailable" : ""}</span>
              </button>
              {!unlocked[index] && <span id={`step-${entry.id}-reason`} className="visually-hidden">
                {index === CREATE ? "Confirm product protection in Product first." : index === REVIEW ? "Create a creative first." : "Approve a creative in Review first."}
              </span>}
            </li>
          ))}
        </ol>
        <div className="rail-bottom">
          {data && <p className="mode-pill" data-mode={data.mode}><span className="mode-dot" aria-hidden="true" />{data.mode === "demo" ? "Demo workspace" : "Live generation"}</p>}
          <p>{data?.mode === "demo" ? "Example renders. No generation." : "Powered by ComfyUI"}</p>
        </div>
      </nav>

      <main className="controls" id="studio-editor" ref={controlsRef} tabIndex={-1}>
        <div className="workspace-context"><span>{brand?.name ?? "Workspace"}</span><span>{String(step + 1).padStart(2, "0")} / 05</span></div>
        {loadError && <p className="notice notice-error" role="alert">{loadError}</p>}
        {data && brand ? (
          <>
            {step === BRAND && <BrandStep kit={brand} catalog={data.directionCatalog} onKit={setBrand} />}
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
                creatives={reviewCreatives}
                selected={selected}
                approved={studio.approved}
                copy={studio.copy}
                copyLines={data.copyLines}
                safety={data.safety}
                onSelect={select}
                onCopyChange={studio.setCopy}
                onToggleApproved={toggleReviewApproval}
                onRemove={removeReview}
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
              <p className="step-nav-hint">
                {step === BRAND ? "Review your kit, then add your product." : step === PRODUCT && !protectConfirmed ? "Confirm product protection to continue." : step === REVIEW && studio.approved.size === 0 ? "Approve a creative to unlock exports." : `Step ${step + 1} of ${STEPS.length}`}
              </p>
              <div className="step-nav-buttons">
              {step > 0 && (
                <button className="button button-secondary" type="button" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              )}
              {step < STEPS.length - 1 && step !== CREATE && (
                <button className="button" type="button" disabled={!unlocked[step + 1]} onClick={() => setStep(step + 1)}>
                  Continue to {STEPS[step + 1].name}<span aria-hidden="true">↗</span>
                </button>
              )}
              </div>
            </div>
          </>
        ) : (
          !loadError && <p className="empty" role="status">Loading the studio...</p>
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
          comparison={preview.comparison}
          overlay={protectOverlay}
          custom={step === BRAND && brand ? <BrandPreview kit={brand} /> : undefined}
        />
      )}
    </div>
  );
}
