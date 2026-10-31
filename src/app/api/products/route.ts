import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/server/config";
import { describeError } from "@/lib/server/jobs";
import { consumeUpload } from "@/lib/server/limits";
import { blockingReason } from "@/lib/server/live";
import { UploadError, createUpload, toProductView } from "@/lib/server/products";
import { currentVisitor } from "@/lib/server/visitor";
import { FALLBACK_MESSAGES, type UploadedProductView } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Multipart overhead on top of the photo itself.
const FORM_OVERHEAD_BYTES = 64 * 1024;

/** Upload a product photo (PNG, JPEG or WebP, up to 10 MB). Starts its cutout on Comfy Cloud. */
export async function POST(request: Request): Promise<NextResponse<UploadedProductView | ApiError>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES) return NextResponse.json({ error: "The photo is larger than 10 MB." }, { status: 413 });
  const blocked = blockingReason();
  if (blocked) return NextResponse.json({ error: `${FALLBACK_MESSAGES[blocked]} Your own product needs live generation.` }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a form upload." }, { status: 400 });
  }
  const photo = form.get("photo");
  if (!(photo instanceof File)) return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  if (photo.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "The photo is larger than 10 MB." }, { status: 413 });
  const name = typeof form.get("name") === "string" ? (form.get("name") as string) : "";

  const visitor = await currentVisitor();
  if (!(await consumeUpload(visitor))) return NextResponse.json({ error: "You have used today's product uploads. Try again tomorrow." }, { status: 429 });
  try {
    const product = await createUpload(Buffer.from(await photo.arrayBuffer()), name, visitor.id);
    return NextResponse.json(toProductView(product), { status: 201 });
  } catch (error: unknown) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 422 });
    const { status, ...rest } = describeError(error);
    return NextResponse.json(rest, { status });
  }
}
