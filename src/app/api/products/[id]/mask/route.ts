import { NextResponse } from "next/server";
import { parseBoxes } from "@/lib/glyph-mask";
import { UploadError, loadUpload, toProductView, updateMask } from "@/lib/server/products";
import { currentVisitor } from "@/lib/server/visitor";
import type { UploadedProductView } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/** Save the label boxes and threshold; the server rebuilds the glyph mask from them. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<UploadedProductView | ApiError>> {
  const { id } = await params;
  const product = await loadUpload(id, (await currentVisitor()).id);
  if (!product) return NextResponse.json({ error: "That product is not in your workspace." }, { status: 404 });
  let body: { boxes?: unknown; threshold?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const boxes = parseBoxes(body.boxes);
  if (!boxes) return NextResponse.json({ error: "Draw one to six boxes over the label." }, { status: 400 });
  if (typeof body.threshold !== "number" || !Number.isFinite(body.threshold)) return NextResponse.json({ error: "Invalid threshold." }, { status: 400 });
  try {
    return NextResponse.json(toProductView(await updateMask(product, boxes, body.threshold)));
  } catch (error: unknown) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error("mask update failed", id, error);
    return NextResponse.json({ error: "Could not build the label mask." }, { status: 500 });
  }
}
