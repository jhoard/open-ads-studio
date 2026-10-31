import { NextResponse } from "next/server";
import { liveStatus } from "@/lib/server/live";
import { currentVisitor } from "@/lib/server/visitor";
import type { LiveStatus } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live or examples, why, and what this visitor has left today. */
export async function GET(): Promise<NextResponse<LiveStatus | ApiError>> {
  try {
    return NextResponse.json(await liveStatus(await currentVisitor()));
  } catch (error: unknown) {
    console.error("limits lookup failed", error);
    return NextResponse.json({ error: "Could not read today's run allowance." }, { status: 500 });
  }
}
