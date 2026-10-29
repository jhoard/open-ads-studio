"use client";

import type { Creative } from "@/lib/studio";
import { CreativeCard } from "./CreativeCard";

interface ReviewStepProps {
  creatives: Creative[];
  approved: Set<string>;
  onToggleApproved: (id: string) => void;
  onRemove: (id: string) => void;
}

export function ReviewStep({ creatives, approved, onToggleApproved, onRemove }: ReviewStepProps) {
  return (
    <section className="panel" aria-labelledby="review-heading">
      <h2 id="review-heading">Review</h2>
      <p className="lede">
        Label match compares the protected region with the source packshot (SSIM structure, so relighting does not count against it). Model alone is the same score for the model&apos;s output before the label is restored.
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
              onToggleApproved={() => onToggleApproved(creative.id)}
              onRemove={() => onRemove(creative.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
