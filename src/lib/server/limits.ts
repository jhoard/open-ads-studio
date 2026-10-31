import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Visitor } from "./visitor";

// Spend guards for live generation: per visitor (cookie and IP, each counted) and one global cap, per day.
// On a deployment, live mode refuses to run without them; locally there are no caps.

export type RunKind = "scene" | "video";

export const DAILY_LIMITS = { scene: 10, video: 3, global: 150 } as const;
/** Uploads each run a cutout on Comfy Cloud; cheap, but capped too. */
export const DAILY_UPLOADS = 5;
const WINDOW = "1 d";

export interface Allowance {
  limit: number;
  remaining: number;
}

export interface Allowances {
  scene: Allowance;
  video: Allowance;
  global: Allowance;
}

export type CapReason = "visitor-scene" | "visitor-video" | "global";

function redisFromEnv(): Redis | null {
  // The Vercel Marketplace integration may name these either way.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

interface Limiters {
  scene: Ratelimit;
  video: Ratelimit;
  global: Ratelimit;
  upload: Ratelimit;
}

let limiters: Limiters | null | undefined;

function getLimiters(): Limiters | null {
  if (limiters !== undefined) return limiters;
  const redis = redisFromEnv();
  const make = (limit: number, prefix: string): Ratelimit => new Ratelimit({ redis: redis as Redis, limiter: Ratelimit.fixedWindow(limit, WINDOW), prefix: `oas:${prefix}`, analytics: false });
  limiters = redis
    ? { scene: make(DAILY_LIMITS.scene, "scene"), video: make(DAILY_LIMITS.video, "video"), global: make(DAILY_LIMITS.global, "global"), upload: make(DAILY_UPLOADS, "upload") }
    : null;
  return limiters;
}

/** True when caps are enforced. A deployment without Redis must not generate. */
export const guardsAvailable = (): boolean => getLimiters() !== null;
export const guardsRequired = (): boolean => Boolean(process.env.VERCEL);

const ids = (visitor: Visitor): string[] => [`v:${visitor.id}`, `ip:${visitor.ipHash}`];

async function remainingFor(limiter: Ratelimit, identifiers: string[]): Promise<number> {
  const results = await Promise.all(identifiers.map((id) => limiter.getRemaining(id)));
  return Math.min(...results.map((result) => result.remaining));
}

/** What this visitor has left today; null when no caps are enforced. */
export async function allowances(visitor: Visitor): Promise<Allowances | null> {
  const l = getLimiters();
  if (!l) return null;
  const [scene, video, global] = await Promise.all([remainingFor(l.scene, ids(visitor)), remainingFor(l.video, ids(visitor)), remainingFor(l.global, ["all"])]);
  return {
    scene: { limit: DAILY_LIMITS.scene, remaining: scene },
    video: { limit: DAILY_LIMITS.video, remaining: video },
    global: { limit: DAILY_LIMITS.global, remaining: global },
  };
}

/** Check every cap first, then spend one run from each; a refusal names the cap that stopped it. */
export async function consumeRun(kind: RunKind, visitor: Visitor): Promise<{ ok: true } | { ok: false; reason: CapReason }> {
  const l = getLimiters();
  if (!l) return { ok: true };
  const limiter = l[kind];
  const [own, global] = await Promise.all([remainingFor(limiter, ids(visitor)), remainingFor(l.global, ["all"])]);
  if (own <= 0) return { ok: false, reason: kind === "scene" ? "visitor-scene" : "visitor-video" };
  if (global <= 0) return { ok: false, reason: "global" };
  await Promise.all([...ids(visitor).map((id) => limiter.limit(id)), l.global.limit("all")]);
  return { ok: true };
}

/** Spend one upload; false when this visitor has used today's uploads. */
export async function consumeUpload(visitor: Visitor): Promise<boolean> {
  const l = getLimiters();
  if (!l) return true;
  if ((await remainingFor(l.upload, ids(visitor))) <= 0) return false;
  await Promise.all(ids(visitor).map((id) => l.upload.limit(id)));
  return true;
}
