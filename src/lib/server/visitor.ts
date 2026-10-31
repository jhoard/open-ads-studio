import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";

// Who is asking, for spend caps and to keep uploads private to their owner. The cookie is random and
// carries nothing else; the IP is hashed with a server secret so raw addresses are never stored.

const COOKIE = "oas_visitor";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const VISITOR_PATTERN = /^[0-9a-f-]{36}$/i;

export interface Visitor {
  id: string;
  ipHash: string;
}

function hashIp(ip: string): string {
  const salt = process.env.VISITOR_SALT ?? "open-ads-studio";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 24);
}

/** The visitor behind this request; sets the cookie on first contact. Route handlers only. */
export async function currentVisitor(): Promise<Visitor> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id || !VISITOR_PATTERN.test(id)) {
    id = randomUUID();
    jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: COOKIE_MAX_AGE, path: "/" });
  }
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "local";
  return { id, ipHash: hashIp(ip) };
}
