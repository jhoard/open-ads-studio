"use client";

import type { BrandSafety, Creative, Objective } from "@/lib/studio";
import { CreativeDetail, CreativeRow } from "./CreativeCard";

interface ReviewStepProps {
  creatives: Creative[];
  selected: Creative | null;
  approved: Set<string>;
  copy: Record<string, string>;
  copyLines: Record<Objective, string[]>;
  safety: BrandSafety;
  showModel: boolean;
  onShowModel: (show: boolean) => void;
  onSelect: (id: string) => void;
  onCopyChange: (id: string, text: string) => void;
  onToggleApproved: (id: string) => void;
  onRemove: (id: string) => void;
}

/** The line a creative starts with: the first suggestion for its objective. */
export const defaultCopy = (creative: Creative, lines: Record<Objective, string[]>): string => lines[creative.objective ?? "awareness"][0] ?? "";

export function ReviewStep({ creatives, selected, approved, copy, copyLines, safety, showModel, onShowModel, onSelect, onCopyChange, onToggleApproved, onRemove }: ReviewStepProps) {
  return (
    <section className="step" aria-labelledby="review-heading">
      <h1 id="review-heading" className="step-title">
        Review
      </h1>
      <p className="step-lede">
        Label match compares the protected glyphs with the source packshot, so relighting does not count against it. Model alone is the same score before the label is restored.
      </p>
      {creatives.length === 0 ? (
        <p className="empty">No creatives yet. Make some in Create.</p>
      ) : (
        <>
          <ul className="creative-list">
            {creatives.map((creative) => (
              <CreativeRow key={creative.id} creative={creative} selected={selected?.id === creative.id} approved={approved.has(creative.id)} onSelect={() => onSelect(creative.id)} />
            ))}
          </ul>
          {selected && (
            <CreativeDetail
              creative={selected}
              approved={approved.has(selected.id)}
              copy={copy[selected.id] ?? defaultCopy(selected, copyLines)}
              copyLines={copyLines}
              safety={safety}
              showModel={showModel}
              onShowModel={onShowModel}
              onCopyChange={(text) => onCopyChange(selected.id, text)}
              onToggleApproved={() => onToggleApproved(selected.id)}
              onRemove={() => onRemove(selected.id)}
            />
          )}
        </>
      )}
    </section>
  );
}
