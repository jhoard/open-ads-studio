import sharp from "sharp";
import { UPLOAD_FILES, loadUpload, readUploadFile, type UploadFile } from "@/lib/server/products";
import { currentVisitor } from "@/lib/server/visitor";

export const runtime = "nodejs";

const isUploadFile = (name: string): name is UploadFile => Object.hasOwn(UPLOAD_FILES, name);

/** An upload's photo, packshot, cutout or mask, for its owner only. ?alpha=1 turns the mask into alpha for CSS masking. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; name: string }> }): Promise<Response> {
  const { id, name } = await params;
  if (!isUploadFile(name)) return new Response("Not found", { status: 404 });
  const product = await loadUpload(id, (await currentVisitor()).id);
  const data = product ? await readUploadFile(product, name) : null;
  if (!data) return new Response("Not found", { status: 404 });
  const headers = { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" };
  if (name === "mask" && new URL(request.url).searchParams.get("alpha") === "1") {
    const { data: luma, info } = await sharp(data).greyscale().raw().toBuffer({ resolveWithObject: true });
    const white = sharp({ create: { width: info.width, height: info.height, channels: 3, background: "#ffffff" } });
    const png = await white.joinChannel(luma, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
    return new Response(new Uint8Array(png), { headers });
  }
  return new Response(new Uint8Array(data), { headers });
}
