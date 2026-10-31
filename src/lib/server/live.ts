import { FALLBACK_MESSAGES, type FallbackReason, type LiveStatus } from "@/lib/studio";
import { GENERATION_MODE } from "./config";
import { DAILY_LIMITS, allowances, guardsAvailable, guardsRequired } from "./limits";
import type { Visitor } from "./visitor";

// Whether this request may generate, and why not. Demo examples are the fallback for every "no".

/** Reasons that switch the whole studio to examples, before any per-run cap is checked. */
export function blockingReason(): FallbackReason | null {
  if (GENERATION_MODE === "demo") return "demo-mode";
  if (!process.env.COMFY_API_KEY) return "no-key";
  if (guardsRequired() && !guardsAvailable()) return "no-guard";
  return null;
}

export async function liveStatus(visitor: Visitor): Promise<LiveStatus> {
  const reason = blockingReason();
  const left = reason ? null : await allowances(visitor);
  const remaining = left ? { scene: left.scene.remaining, video: left.video.remaining, global: left.global.remaining } : null;
  return { live: reason === null, reason, message: reason ? FALLBACK_MESSAGES[reason] : null, remaining, limits: { ...DAILY_LIMITS } };
}
