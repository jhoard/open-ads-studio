import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { NextResponse } from "next/server";
import { checkClaims } from "@/lib/claims-guard";
import { EXPORT_SIZES, type ExportSize } from "@/lib/export-layout";
import { findRecipe } from "@/lib/recipes";
import { loadBrand, loadBrandSafety } from "@/lib/server/catalog";
import { renderClip, renderStill } from "@/lib/server/export-render";
import { findJob, outputPath } from "@/lib/server/jobs";
import { STAGE_MODELS, buildProvenance } from "@/lib/server/provenance";
import type { ApiError, StageName } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COPY_LENGTH = 140;

interface ExportBody {
  creativeId?: unknown;
  recipe?: unknown;
  demo?: unknown;
  sizes?: unknown;
  copy?: unknown;
}

interface Source {
  file: string;
  kind: "image" | "video";
  stage: StageName;
  label: string;
  seed: number | null;
  generatedAt: string | null;
  labelMatch: number | null;
  example: boolean;
}

const fail = (status: number, error: string): NextResponse<ApiError> => NextResponse.json({ error }, { status });

/** Demo creatives export their bundled example; live ones export the finished job output. */
async function resolveSource(body: ExportBody): Promise<Source | string> {
  if (body.demo === true) {
    const recipe = typeof body.recipe === "string" ? findRecipe(body.recipe) : undefined;
    if (!recipe) return "Unknown recipe.";
    const stage: StageName = recipe.id === "scene" ? "scene-relight" : recipe.id === "reveal-final" ? "hero-h3" : "vfx-reveal";
    const file = path.join(process.cwd(), "public", recipe.example.url.replace(/^\//, ""));
    return { file, kind: recipe.example.kind, stage, label: recipe.label, seed: null, generatedAt: null, labelMatch: recipe.example.labelMatch ?? null, example: true };
  }
  if (typeof body.creativeId !== "string" || !UUID_PATTERN.test(body.creativeId)) return "Missing creative.";
  const job = await findJob(body.creativeId);
  if (!job || job.status !== "succeeded" || !job.outputFile || !job.outputKind) return "That creative is not ready to export.";
  return {
    file: outputPath(job.outputFile),
    kind: job.outputKind,
    stage: job.stage,
    label: job.label,
    seed: job.seed,
    generatedAt: job.completedAt,
    labelMatch: job.labelMatch?.final ?? null,
    example: false,
  };
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function POST(request: Request): Promise<Response> {
  let body: ExportBody;
  try {
    body = (await request.json()) as ExportBody;
  } catch {
    return fail(400, "Expected a JSON body.");
  }
  const sizes = Array.isArray(body.sizes) ? body.sizes.filter((size): size is ExportSize => EXPORT_SIZES.includes(size as ExportSize)) : [];
  if (sizes.length === 0) return fail(400, "Pick at least one export size.");
  if (typeof body.copy !== "string" || !body.copy.trim() || body.copy.length > MAX_COPY_LENGTH) return fail(400, `Copy line must be 1 to ${MAX_COPY_LENGTH} characters.`);
  const copy = body.copy.trim();

  const [brand, safety] = await Promise.all([loadBrand(), loadBrandSafety()]);
  // Checked again here: the browser's verdict is a convenience, the server's is the gate.
  const claims = checkClaims(copy, safety.claimsGuard);
  if (claims.status === "blocked") return fail(422, `Copy line blocked by the claims guard: ${claims.blocked.join(", ")}.`);

  const source = await resolveSource(body);
  if (typeof source === "string") return fail(400, source);

  const workDir = path.join(os.tmpdir(), `oas-export-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    const models = STAGE_MODELS[source.stage]?.models ?? [];
    const disclosure = { models, basis: safety.disclosureBasis, provenanceRef: "provenance.json" };
    const files: Record<string, Uint8Array> = {};
    const base = slug(`tauvel ${source.label}`);
    for (const size of sizes) {
      const name = `${base}-${size.replace(":", "x")}`;
      if (source.kind === "image") {
        files[`${name}.png`] = new Uint8Array(await renderStill(source.file, size, brand, copy, disclosure));
      } else {
        const out = path.join(workDir, `${name}.mp4`);
        await renderClip(source.file, size, brand, copy, disclosure, out, workDir);
        files[`${name}.mp4`] = new Uint8Array(await readFile(out));
      }
    }
    const provenance = await buildProvenance({ ...source, copy, claims, safety, sizes });
    files["provenance.json"] = strToU8(JSON.stringify(provenance, null, 2));
    files["DISCLOSURE.txt"] = strToU8(
      `AI-generated with open-weight models: ${models.join(", ")}.\nDisclosure basis: ${safety.disclosureBasis.join("; ")}.\n${safety.disclosureRequirements.join("\n")}\n` +
        (claims.flagged.length ? `Needs substantiation before running: ${claims.flagged.join(", ")}.\n` : ""),
    );
    const zip = zipSync(files, { level: 0 });
    return new Response(new Uint8Array(zip), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${base}-pack.zip"`, "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && source.kind === "video") {
      return fail(501, "Clip exports need ffmpeg on the server. Run the studio locally to export clips.");
    }
    console.error("export failed", error);
    return fail(500, "The export could not be rendered.");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
