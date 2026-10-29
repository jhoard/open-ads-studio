import { NextResponse } from "next/server";
import { findRecipe, type RecipeId } from "@/lib/recipes";
import { loadBrand, loadProduct } from "@/lib/server/catalog";
import { GENERATION_MODE } from "@/lib/server/config";
import { describeError, findJobByKey, toView } from "@/lib/server/jobs";
import { RecipeInputError, startRecipe } from "@/lib/server/runs";
import type { Creative } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEED = 2 ** 31 - 1;

const fail = (status: number, error: string): NextResponse<ApiError> => NextResponse.json({ error }, { status });

interface RunBody {
  recipe?: unknown;
  directionId?: unknown;
  seed?: unknown;
  idempotencyKey?: unknown;
}

/** Demo mode: the recipe's bundled example, shaped like a finished job. */
function demoCreative(recipe: RecipeId, idempotencyKey: string): Creative {
  const info = findRecipe(recipe);
  if (!info) throw new Error(`unknown recipe ${recipe}`);
  const now = new Date().toISOString();
  return {
    id: `demo-${recipe}-${idempotencyKey.slice(0, 8)}`,
    recipe,
    demo: true,
    stage: recipe === "scene" ? "scene-relight" : recipe === "reveal-final" ? "hero-h3" : "vfx-reveal",
    runId: idempotencyKey,
    label: info.label,
    aspect: "3:4",
    seed: 0,
    comfyJobId: "",
    status: "succeeded",
    queuePosition: null,
    errorType: null,
    errorMessage: null,
    createdAt: now,
    startedAt: now,
    completedAt: now,
    outputUrl: info.example.url,
    outputKind: info.example.kind,
    rawUrl: info.example.rawUrl ?? null,
    labelMatch: info.example.labelMatch ?? null,
    modelLabelMatch: info.example.modelLabelMatch ?? null,
    waitTimeoutSeconds: 0,
  };
}

export async function POST(request: Request): Promise<NextResponse<Creative | ApiError>> {
  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return fail(400, "Expected a JSON body.");
  }
  const recipe = typeof body.recipe === "string" ? findRecipe(body.recipe) : undefined;
  if (!recipe) return fail(400, "Unknown recipe.");
  if (typeof body.idempotencyKey !== "string" || !UUID_PATTERN.test(body.idempotencyKey)) return fail(400, "Missing or invalid idempotency key.");
  if (body.directionId !== undefined && typeof body.directionId !== "string") return fail(400, "Invalid scene direction.");
  if (body.seed !== undefined && !(Number.isInteger(body.seed) && (body.seed as number) >= 0 && (body.seed as number) <= MAX_SEED)) return fail(400, "Seed must be a non-negative integer.");

  if (GENERATION_MODE === "demo") return NextResponse.json(demoCreative(recipe.id, body.idempotencyKey));

  const existing = await findJobByKey(body.idempotencyKey);
  if (existing) return NextResponse.json({ ...toView(existing), recipe: recipe.id, demo: false });
  try {
    const [brand, product] = await Promise.all([loadBrand(), loadProduct()]);
    const job = await startRecipe(brand, product, {
      recipe: recipe.id,
      directionId: body.directionId as string | undefined,
      seed: body.seed as number | undefined,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ ...toView(job), recipe: recipe.id, demo: false }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof RecipeInputError) return fail(422, error.message);
    const { status, ...rest } = describeError(error);
    return NextResponse.json(rest, { status });
  }
}
