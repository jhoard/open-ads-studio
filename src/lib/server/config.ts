import { config } from "dotenv";
import path from "node:path";

// Override so the project key beats any COMFY_API_KEY left in the shell.
config({ override: true, quiet: true });

export const WAIT_TIMEOUT_SECONDS = Number(process.env.GENERATION_WAIT_TIMEOUT_SECONDS ?? 660);
// Runtime data directory, not source: keep it out of the deployment trace.
export const DATA_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_ROOT ?? "var");
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const dataPath = (...parts: string[]): string => path.join(/*turbopackIgnore: true*/ DATA_ROOT, ...parts);

// "demo" serves the bundled example creatives and never calls Comfy, so a public link cannot spend credits.
// Default: demo on Vercel, live everywhere else. Set GENERATION_MODE=live to generate on a deployment.
export type GenerationMode = "live" | "demo";
export const GENERATION_MODE: GenerationMode =
  process.env.GENERATION_MODE === "live" || process.env.GENERATION_MODE === "demo" ? process.env.GENERATION_MODE : process.env.VERCEL ? "demo" : "live";
