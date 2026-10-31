import type { BrandKit } from "@/lib/brand-kit";
import type { ClaimsGuard } from "@/lib/claims-guard";
import type { RecipeInfo } from "@/lib/recipes";
import type { JobView, SceneDirection } from "@/lib/types";

// What the studio page loads in one call. Client-safe: URLs only, no server paths.

export interface StudioProduct {
  name: string;
  description: string;
  photoUrl: string;
  protectMaskUrl: string | null;
  /** Share of the packshot's pixels that are protected. */
  protectedShare: number | null;
  reveal: { startUrl: string; endUrl: string } | null;
}

export const OBJECTIVES = ["sales", "leads", "traffic", "awareness", "engagement"] as const;
export type Objective = (typeof OBJECTIVES)[number];

/** Brand-safety block for the product (docs/brand-safety-ontology.md). */
export interface BrandSafety {
  category: string;
  subcategories: string[];
  riskRating: "low" | "medium" | "elevated";
  riskReason: string;
  claimsGuard: ClaimsGuard;
  disclosureRequirements: string[];
  disclosureBasis: string[];
}

/** Why the studio is or is not generating right now, and what this visitor has left today. */
export type FallbackReason = "demo-mode" | "no-key" | "no-guard" | "visitor-scene" | "visitor-video" | "global" | "comfy-error";

export interface LiveStatus {
  live: boolean;
  /** Set when live generation is unavailable, or a run fell back to an example. */
  reason: FallbackReason | null;
  message: string | null;
  /** Runs left today; null when no caps are enforced (local runs). */
  remaining: { scene: number; video: number; global: number } | null;
  limits: { scene: number; video: number; global: number };
}

export const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  "demo-mode": "This deployment runs in demo mode, so every creative is an example render.",
  "no-key": "Live generation is off: the server has no Comfy API key. Showing example renders.",
  "no-guard": "Live generation is off: the spend guard is not configured. Showing example renders.",
  "visitor-scene": "You have used today's Scene runs. Showing example renders until tomorrow.",
  "visitor-video": "You have used today's video runs. Showing example renders until tomorrow.",
  global: "Today's shared run budget is used up. Showing example renders until tomorrow.",
  "comfy-error": "Comfy Cloud could not take the job, so this is an example render.",
};

/** A product uploaded by this visitor, as the browser sees it. */
export interface UploadedProductView {
  id: string;
  name: string;
  status: "cutting" | "ready" | "failed";
  error: string | null;
  photoUrl: string;
  packshotUrl: string | null;
  maskUrl: string | null;
  boxes: { x: number; y: number; width: number; height: number }[];
  threshold: number;
  protectedShare: number | null;
}

export interface StudioData {
  mode: "live" | "demo";
  live: LiveStatus;
  brand: BrandKit;
  /** Every scene direction the app can render; kits pick from these. */
  directionCatalog: SceneDirection[];
  product: StudioProduct;
  recipes: readonly RecipeInfo[];
  safety: BrandSafety;
  /** Copy-line templates by objective. */
  copyLines: Record<Objective, string[]>;
}

/** A finished or in-flight creative on the Review step. */
export interface Creative extends JobView {
  recipe: string;
  demo: boolean;
  /** Set when a live request fell back to an example render. */
  fallback?: { reason: FallbackReason; message: string };
  /** The product it was made from: "tauvel" or an upload's ID. */
  productId?: string;
  objective?: Objective;
}
