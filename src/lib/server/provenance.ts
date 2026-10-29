import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ClaimsCheck } from "@/lib/claims-guard";
import type { BrandSafety } from "@/lib/studio";
import type { StageName } from "@/lib/types";

// Provenance on every export (docs/brand-safety-ontology.md, section 5).

export const STAGE_MODELS: Partial<Record<StageName, { models: string[]; workflows: string[] }>> = {
  "scene-relight": { models: ["Qwen-Image-Edit 2509", "Qwen-Image-Edit 2509 Lightning 4-step LoRA"], workflows: ["scene-edit.json"] },
  "vfx-reveal": { models: ["LTX-2 19B distilled"], workflows: ["vfx-ltx-reveal.json"] },
  "hero-h3": { models: ["MiniMax H3"], workflows: ["hero-h3.json"] },
};

async function gitSha(): Promise<string> {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    const head = (await readFile(path.join(process.cwd(), ".git", "HEAD"), "utf8")).trim();
    if (!head.startsWith("ref: ")) return head;
    return (await readFile(path.join(process.cwd(), ".git", head.slice(5)), "utf8")).trim();
  } catch {
    return "unknown";
  }
}

async function fileHash(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex").slice(0, 12);
}

export interface ProvenanceInput {
  stage: StageName;
  label: string;
  seed: number | null;
  generatedAt: string | null;
  example: boolean;
  copy: string;
  claims: ClaimsCheck;
  labelMatch: number | null;
  safety: BrandSafety;
  sizes: string[];
  fromScene: boolean;
}

export async function buildProvenance(input: ProvenanceInput): Promise<Record<string, unknown>> {
  const sha = await gitSha();
  const own = STAGE_MODELS[input.stage] ?? { models: [], workflows: [] };
  const scene = input.fromScene ? (STAGE_MODELS["scene-relight"] ?? { models: [], workflows: [] }) : { models: [], workflows: [] };
  const stage = { models: [...scene.models, ...own.models], workflows: [...scene.workflows, ...own.workflows] };
  return {
    ai_generated: true,
    generator: "open-ads-studio",
    creative: input.label,
    example_render: input.example,
    workflow: stage.workflows.map((workflow) => `${workflow}@${sha.slice(0, 12)}`),
    models: stage.models,
    open_weights_only: true,
    seed: input.seed,
    brand_ref: `brand.json@${await fileHash(path.join(process.cwd(), "assets", "tauvel", "brand.json"))}`,
    generated_at: input.generatedAt,
    exported_at: new Date().toISOString(),
    reviewed_by: null,
    status: "approved",
    label_match: input.labelMatch,
    copy_line: input.copy,
    claims_check: input.claims,
    sizes: input.sizes,
    brand_safety: {
      category: input.safety.category,
      subcategories: input.safety.subcategories,
      risk_rating: input.safety.riskRating,
      disclosure_requirements: input.safety.disclosureRequirements,
    },
    disclosure_basis: input.safety.disclosureBasis,
    input_assets: "Packshots made with GPT Image (the brand owner's own IP); all generation in the app is open weights.",
  };
}
