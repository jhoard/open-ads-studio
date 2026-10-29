"use client";

import type { BrandSafety, Creative, Objective } from "@/lib/studio";
import { CreativeCard } from "./CreativeCard";

interface ReviewStepProps {
  creatives: Creative[];
  approved: Set<string>;
  copy: Record<string, string>;
  copyLines: Record<Objective, string[]>;
  safety: BrandSafety;
  onCopyChange: (id: string, text: string) => void;
  onToggleApproved: (id: string) => void;
  onRemove: (id: string) => void;
}

/** The line a creative starts with: the first suggestion for its objective. */
export const defaultCopy = (creative: Creative, lines: Record<Objective, string[]>): string => lines[creative.objective ?? "awareness"][0] ?? "";

export function ReviewStep({ creatives, approved, copy, copyLines, safety, onCopyChange, onToggleApproved, onRemove }: ReviewStepProps) {
  return (
    <section className="panel" aria-labelledby="review-heading">
      <h2 id="review-heading">Review</h2>
      <p className="lede">
        Label match compares the protected region with the source packshot (SSIM structure, so relighting does not count against it). Model alone is the same score for the model&apos;s output before the label is restored. Every copy line runs through the claims guard for a {safety.riskRating}-risk {safety.subcategories[0]} product.
      </p>
      {creatives.length === 0 ? (
        <p className="empty">No creatives yet. Create some in step 3.</p>
      ) : (
        <div className="creative-grid">
          {creatives.map((creative) => (
            <CreativeCard
              key={creative.id}
              creative={creative}
              approved={approved.has(creative.id)}
              copy={copy[creative.id] ?? defaultCopy(creative, copyLines)}
              copyLines={copyLines}
              safety={safety}
              onCopyChange={(text) => onCopyChange(creative.id, text)}
              onToggleApproved={() => onToggleApproved(creative.id)}
              onRemove={() => onRemove(creative.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
