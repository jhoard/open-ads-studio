import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, dataPath } from "@/lib/server/config";
import { createJob, describeError, findJobByKey, toView } from "@/lib/server/jobs";
import type { ApiError, JobView } from "@/lib/types";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Magic bytes, so a renamed file cannot pose as an image.
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

const fail = (status: number, error: string): NextResponse<ApiError> => NextResponse.json({ error }, { status });

export async function POST(request: Request): Promise<NextResponse<JobView | ApiError>> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Expected a multipart form upload.");
  }

  const idempotencyKey = form.get("idempotencyKey");
  const image = form.get("image");
  if (typeof idempotencyKey !== "string" || !UUID_PATTERN.test(idempotencyKey)) return fail(400, "Missing or invalid idempotency key.");
  if (!(image instanceof File)) return fail(400, "Attach a product image.");
  const ext = ALLOWED_IMAGE_TYPES[image.type];
  if (!ext) return fail(415, "Use a PNG, JPEG or WebP image.");
  if (image.size > MAX_UPLOAD_BYTES) return fail(413, "Images must be 10 MB or smaller.");

  const existing = await findJobByKey(idempotencyKey);
  if (existing) return NextResponse.json(toView(existing));

  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!SIGNATURES[ext](bytes)) return fail(415, "That file is not a valid image.");

  const id = randomUUID();
  const imagePath = dataPath("uploads", `${id}.${ext}`);
  try {
    await mkdir(path.dirname(imagePath), { recursive: true });
    await writeFile(imagePath, bytes);
    const record = await createJob({ id, stage: "vfx-ltx", idempotencyKey, imagePath });
    return NextResponse.json(toView(record), { status: 201 });
  } catch (error: unknown) {
    const { status, ...body } = describeError(error);
    return NextResponse.json(body, { status });
  }
}
