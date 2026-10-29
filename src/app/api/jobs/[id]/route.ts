import { NextResponse } from "next/server";
import { describeError, findJob, syncJob, toView } from "@/lib/server/jobs";
import type { ApiError, JobView } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<JobView | ApiError>> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Unknown job." }, { status: 404 });

  const record = await findJob(id);
  if (!record) return NextResponse.json({ error: "Unknown job." }, { status: 404 });

  try {
    return NextResponse.json(toView(await syncJob(record)));
  } catch (error: unknown) {
    const { status, ...body } = describeError(error);
    return NextResponse.json(body, { status });
  }
}
