import path from "node:path";
import { findJob, readOutput } from "@/lib/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;
const CONTENT_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const record = UUID_PATTERN.test(id) ? await findJob(id) : null;
  // ?file=raw is the model's output before the glyph paste; ?file=glyphs is the placed glyph mask.
  const extra = new URL(request.url).searchParams.get("file");
  const name = extra === "raw" || extra === "glyphs" ? record?.extraFiles?.[extra] : record?.outputFile;
  if (!record || !name) return new Response("Not found", { status: 404 });

  const ext = path.extname(name);
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return new Response("Not found", { status: 404 });
  const data = await readOutput(name);
  if (!data) return new Response("Not found", { status: 404 });
  const size = data.length;
  const download = new URL(request.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    ...(download ? { "Content-Disposition": `attachment; filename="open-ads-studio-${record.stage}-${id.slice(0, 8)}${ext}"` } : {}),
  };

  // Browsers seek video with Range requests; Safari will not play without them.
  const match = RANGE_PATTERN.exec(request.headers.get("range") ?? "");
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(size) } });
}
