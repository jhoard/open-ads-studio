"use client";

import type { LiveStatus } from "@/lib/studio";

// Live or examples, why, and what this visitor has left today.

export function LiveBanner({ live, lastFallback }: { live: LiveStatus; lastFallback: string | null }) {
  if (!live.live) {
    return <p className="live-banner live-banner-off" role="status">{live.message}</p>;
  }
  const left = live.remaining;
  return (
    <div className="live-banner" role="status">
      <p>
        <strong>Live:</strong> generating on Comfy Cloud.
        {left && ` You have ${left.scene} of ${live.limits.scene} Scene runs and ${left.video} of ${live.limits.video} video runs left today.`}
      </p>
      {lastFallback && <p className="live-banner-note">{lastFallback}</p>}
    </div>
  );
}
