import type { ClaimsGuard } from "@/lib/claims-guard";
import type { RecipeInfo } from "@/lib/recipes";
import type { Brand, JobView } from "@/lib/types";

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

export interface StudioData {
  mode: "live" | "demo";
  brand: Brand & { logoUrl: string };
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
  objective?: Objective;
}
