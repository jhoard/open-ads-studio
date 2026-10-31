import { NextResponse } from "next/server";
import { DEFAULT_DIRECTION, DIRECTION_EXAMPLES } from "@/lib/directions";
import { findRecipe, type RecipeId } from "@/lib/recipes";
import { loadBrand, loadProduct } from "@/lib/server/catalog";
import { describeError, findJobByKey, toView } from "@/lib/server/jobs";
import { consumeRun, type RunKind } from "@/lib/server/limits";
import { blockingReason } from "@/lib/server/live";
import { isProductId, loadUpload } from "@/lib/server/products";
import { RecipeInputError, catalogSource, startRecipe, uploadSource, type ProductSource } from "@/lib/server/runs";
import { currentVisitor } from "@/lib/server/visitor";
import { FALLBACK_MESSAGES, type Creative, type FallbackReason } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEED = 2 ** 31 - 1;
const CATALOG_PRODUCT = "tauvel";

const fail = (status: number, error: string): NextResponse<ApiError> => NextResponse.json({ error }, { status });

interface RunBody {
  recipe?: unknown;
  directionId?: unknown;
  seed?: unknown;
  sourceCreativeId?: unknown;
  idempotencyKey?: unknown;
  productId?: unknown;
}

const runKind = (recipe: RecipeId): RunKind => (recipe === "scene" ? "scene" : "video");

/** The recipe's bundled example, shaped like a finished job; marked with why it is not a live run. */
function demoCreative(recipe: RecipeId, idempotencyKey: string, directionId: string | undefined, reason: FallbackReason, productId: string): Creative {
  const info = findRecipe(recipe);
  if (!info) throw new Error(`unknown recipe ${recipe}`);
  // A Scene shows the chosen direction's render when one exists.
  const example = recipe === "scene" ? (DIRECTION_EXAMPLES[directionId ?? DEFAULT_DIRECTION] ?? info.example) : info.example;
  const now = new Date().toISOString();
  return {
    id: `demo-${recipe}-${idempotencyKey.slice(0, 8)}`,
    recipe,
    demo: true,
    fallback: { reason, message: FALLBACK_MESSAGES[reason] },
    productId,
    stage: info.stage,
    runId: idempotencyKey,
    // An upload has no example of its own; the label says whose render this is.
    label: productId === "tauvel" ? info.label : `${info.label} (Tauvel example)`,
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
    outputUrl: example.url,
    outputKind: example.kind,
    rawUrl: example.rawUrl ?? null,
    glyphsUrl: example.glyphsUrl ?? null,
    labelMatch: example.labelMatch ?? null,
    modelLabelMatch: example.modelLabelMatch ?? null,
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
  if (body.sourceCreativeId !== undefined && !(typeof body.sourceCreativeId === "string" && UUID_PATTERN.test(body.sourceCreativeId))) return fail(400, "Invalid source creative.");
  if (body.seed !== undefined && !(Number.isInteger(body.seed) && (body.seed as number) >= 0 && (body.seed as number) <= MAX_SEED)) return fail(400, "Seed must be a non-negative integer.");
  const productId = body.productId === undefined ? CATALOG_PRODUCT : body.productId;
  if (typeof productId !== "string" || (productId !== CATALOG_PRODUCT && !isProductId(productId))) return fail(400, "Invalid product.");

  const visitor = await currentVisitor();
  const directionId = body.directionId as string | undefined;
  const fallback = (reason: FallbackReason): NextResponse<Creative> => NextResponse.json(demoCreative(recipe.id, body.idempotencyKey as string, directionId, reason, productId));

  let product: ProductSource;
  if (productId === CATALOG_PRODUCT) {
    product = catalogSource(await loadProduct());
  } else {
    const upload = await loadUpload(productId, visitor.id);
    if (!upload) return fail(404, "That product is not in your workspace.");
    if (upload.status !== "ready" || upload.protectedShare === null) return fail(422, "Finish the product first: wait for the cutout, then mark the label.");
    if (recipe.id === "reveal-draft" || recipe.id === "reveal-final") return fail(422, "Reveal needs a closed and an open shot of the product. It is available for Tauvel only.");
    product = uploadSource(upload);
  }

  const blocked = blockingReason();
  if (blocked) return fallback(blocked);

  const existing = await findJobByKey(body.idempotencyKey);
  if (existing) return NextResponse.json({ ...toView(existing), recipe: recipe.id, demo: false, productId });

  const allowed = await consumeRun(runKind(recipe.id), visitor);
  if (!allowed.ok) return fallback(allowed.reason);

  try {
    const job = await startRecipe(await loadBrand(), product, { recipe: recipe.id, directionId, seed: body.seed as number | undefined, sourceCreativeId: body.sourceCreativeId as string | undefined, idempotencyKey: body.idempotencyKey }, visitor.id);
    return NextResponse.json({ ...toView(job), recipe: recipe.id, demo: false, productId }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof RecipeInputError) return fail(422, error.message);
    const { status, ...rest } = describeError(error);
    console.error("live run failed, falling back", status, rest.code);
    return fallback("comfy-error");
  }
}
