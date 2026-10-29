"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ComparisonSlider } from "./ComparisonSlider";

export interface PreviewMedia {
  kind: "image" | "video";
  url: string;
  posterUrl?: string;
  /** Alpha mask of the restored glyphs, lit up on the creative during the reveal. */
  glyphsUrl?: string | null;
}

export interface LabelReveal {
  from: number;
  to: number;
}

const COUNT_MS = 1200;
const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
// Floor, so a 99.96% match never reads as 100.0%.
const percent = (value: number): string => `${(Math.floor(value * 1000) / 10).toFixed(1)}%`;

/** Counts from the model-alone score up to the restored score; reduced motion shows the result at once. */
function LabelCount({ from, to }: LabelReveal) {
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setValue(from + (to - from) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setValue(from);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to]);

  return (
    <p className="label-count" aria-label={`Label match ${percent(to)}, up from ${percent(from)} for the model alone`}>
      <span className="label-count-value" aria-hidden="true">
        {percent(value)}
      </span>
      <span className="label-count-caption">
        label match, from {percent(from)} for the model alone
      </span>
    </p>
  );
}

interface PreviewStageProps {
  media: PreviewMedia | null;
  title: string;
  detail?: string;
  reveal?: LabelReveal | null;
  /** Changes whenever the shown creative changes, so the reveal replays for each one. */
  revealKey?: string;
  /** Shown over the media, for example the Product step's protect overlay. */
  overlay?: ReactNode;
  /** Replaces the media entirely, for the Brand step. */
  custom?: ReactNode;
  empty?: string;
  comparison?: { beforeUrl: string } | null;
}

export function PreviewStage({ media, title, detail, reveal, revealKey, overlay, custom, empty, comparison }: PreviewStageProps) {
  const video = useRef<HTMLVideoElement>(null);
  const glyphStyle = media?.glyphsUrl ? ({ "--glyphs-url": `url(${media.glyphsUrl})` } as CSSProperties) : undefined;

  useEffect(() => {
    if (!video.current || prefersReducedMotion()) return;
    void video.current.play().catch(() => undefined);
  }, [media?.url]);

  return (
    <section className="preview" aria-label="Preview">
      <div className="preview-toolbar"><span>{custom ? "Identity board" : "Creative preview"}</span><span>{custom ? "Live preview" : "Preview before exporting"}</span></div>
      <div className="preview-frame">
        {custom ??
          (media ? comparison ? (
            <ComparisonSlider key={`${media.url}-${comparison.beforeUrl}`} kind={media.kind} beforeUrl={comparison.beforeUrl} afterUrl={media.url} title={title} />
          ) : (
            <figure className="preview-media" key={`${media.url}-${revealKey ?? ""}`}>
              {media.kind === "image" ? (
                <img src={media.url} alt={title} />
              ) : (
                <video ref={video} src={media.url} poster={media.posterUrl} muted loop playsInline controls aria-label={title} />
              )}
              {reveal && glyphStyle && <span className="glyph-pulse" style={glyphStyle} aria-hidden="true" />}
              {overlay}
            </figure>
          ) : (
            <p className="preview-empty">{empty ?? "Nothing to preview yet."}</p>
          ))}
      </div>
      <div className="preview-caption">
        <div>
          <h2 className="preview-title">{title}</h2>
          {detail && <p className="preview-detail">{detail}</p>}
        </div>
        {reveal && <LabelCount key={revealKey} from={reveal.from} to={reveal.to} />}
      </div>
    </section>
  );
}
