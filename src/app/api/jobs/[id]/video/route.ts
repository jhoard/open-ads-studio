import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { findJob, outputPath } from "@/lib/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

function stream(file: string, start: number, end: number): ReadableStream {
  return Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const record = UUID_PATTERN.test(id) ? await findJob(id) : null;
  if (!record?.outputFile) return new Response("Not found", { status: 404 });

  const file = outputPath(record.outputFile);
  const { size } = await stat(file);
  const download = new URL(request.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    ...(download ? { "Content-Disposition": `attachment; filename="open-ads-studio-${record.stage}-${id.slice(0, 8)}.mp4"` } : {}),
  };

  // Browsers seek video with Range requests; Safari will not play without them.
  const match = RANGE_PATTERN.exec(request.headers.get("range") ?? "");
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(stream(file, start, end), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  return new Response(stream(file, 0, size - 1), { headers: { ...headers, "Content-Length": String(size) } });
}
