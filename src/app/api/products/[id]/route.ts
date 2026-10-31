import { NextResponse } from "next/server";
import { describeError } from "@/lib/server/jobs";
import { loadUpload, syncUpload, toProductView } from "@/lib/server/products";
import { currentVisitor } from "@/lib/server/visitor";
import type { UploadedProductView } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The upload's state; polls its cutout until the packshot is ready. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<UploadedProductView | ApiError>> {
  const { id } = await params;
  const product = await loadUpload(id, (await currentVisitor()).id);
  if (!product) return NextResponse.json({ error: "That product is not in your workspace." }, { status: 404 });
  try {
    return NextResponse.json(toProductView(await syncUpload(product)));
  } catch (error: unknown) {
    const { status, ...rest } = describeError(error);
    return NextResponse.json(rest, { status });
  }
}
