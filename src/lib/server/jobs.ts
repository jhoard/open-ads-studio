import { Comfy, ComfyError, Forbidden, InsufficientCredits, MissingCredentials, QueueFull, Unauthorized } from "@comfyorg/sdk";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { TERMINAL_STATUSES, type JobStatus, type JobView, type OutputKind, type StageJob, type StageName, type StageParams } from "@/lib/types";
import { WAIT_TIMEOUT_SECONDS, dataPath } from "./config";
import { alignToClip, pasteClip } from "./clip-paste";
import { HERO_SIZE } from "./geometry";
import { alignPackshot, pasteGlyphs } from "./glyph-paste";
import { DEFAULT_POST_VFX, postVfx } from "./post-vfx";
import { buildWorkflow, stageOutputs } from "./workflows";

const MAX_ERROR_MESSAGE_LENGTH = 500;

const jobFile = (id: string): string => dataPath("jobs", `${id}.json`);
const keyFile = (key: string): string => dataPath("jobs", "keys", `${key}.json`);
export const outputPath = (file: string): string => dataPath("outputs", file);

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export const findJob = (id: string): Promise<StageJob | null> => readJson<StageJob>(jobFile(id));

export async function findJobByKey(key: string): Promise<StageJob | null> {
  const ref = await readJson<{ id: string }>(keyFile(key));
  return ref ? findJob(ref.id) : null;
}

const OUTPUT_KIND: Record<StageName, OutputKind> = {
  scene: "image",
  "scene-set": "image",
  "scene-edit": "image",
  "scene-composite": "image",
  "scene-relight": "image",
  "vfx-ltx": "video",
  "vfx-reveal": "video",
  "hero-h3": "video",
};
const OUTPUT_EXTENSION: Record<OutputKind, string> = { image: "png", video: "mp4" };

interface CreateJobInput {
  id: string;
  stage: StageName;
  runId: string;
  label: string;
  idempotencyKey: string;
  params: StageParams;
  glyphPaste?: StageJob["glyphPaste"];
  clipPaste?: StageJob["clipPaste"];
}

export async function createJob({ id, stage, runId, label, idempotencyKey, params, glyphPaste, clipPaste }: CreateJobInput): Promise<StageJob> {
  const client = new Comfy();
  const workflow = await buildWorkflow(client, stage, params);
  const submitted = await client.submit(workflow);
  const now = new Date().toISOString();
  const record: StageJob = {
    id,
    idempotencyKey,
    stage,
    runId,
    label,
    aspect: params.aspect,
    seed: params.seed,
    comfyJobId: submitted.id,
    status: submitted.status as JobStatus,
    queuePosition: submitted.queuePosition,
    errorType: null,
    errorMessage: null,
    outputFile: null,
    outputKind: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    ...(glyphPaste ? { glyphPaste } : {}),
    ...(clipPaste ? { clipPaste } : {}),
  };
  await writeJson(jobFile(id), record);
  await writeJson(keyFile(idempotencyKey), { id });
  return record;
}

type JobOutput = Awaited<ReturnType<InstanceType<typeof Comfy>["jobs"]["get"]>>["outputs"][number];

async function saveOutput(output: JobOutput, file: string): Promise<void> {
  const tmp = outputPath(`${file}.${randomUUID()}.tmp`);
  await mkdir(path.dirname(tmp), { recursive: true });
  await output.toFile(tmp);
  await rename(tmp, outputPath(file));
}

/** Scene post-step: find the box in the model's output and paste the protected glyphs back over it. */
async function finishGlyphPaste(record: StageJob, rawFile: string): Promise<Partial<StageJob>> {
  const { packshotPath, protectMaskPath } = record.glyphPaste as NonNullable<StageJob["glyphPaste"]>;
  const finalFile = `${record.id}.final.png`;
  try {
    const align = await alignPackshot(packshotPath, outputPath(rawFile), protectMaskPath);
    const result = await pasteGlyphs(packshotPath, outputPath(rawFile), protectMaskPath, align, outputPath(finalFile));
    return { outputFile: finalFile, extraFiles: { raw: rawFile }, labelMatch: { final: result.labelMatch, model: result.modelLabelMatch } };
  } catch (error: unknown) {
    console.error("glyph paste failed", record.id, error);
    return { status: "failed", errorType: "glyph_paste_failed", errorMessage: "The scene rendered, but the label could not be located and restored.", extraFiles: { raw: rawFile } };
  }
}

/** Cinemagraph post-step: glyph paste on every frame, each tone-matched, then the first and last frame holds. */
async function finishClipPaste(record: StageJob, rawFile: string): Promise<Partial<StageJob>> {
  const { stillPath, packshotPath, protectMaskPath } = record.clipPaste as NonNullable<StageJob["clipPaste"]>;
  const finalFile = `${record.id}.final.mp4`;
  const workDir = dataPath("work", record.id);
  try {
    const still = await sharp(stillPath).metadata();
    const align = alignToClip(await alignPackshot(packshotPath, stillPath, protectMaskPath), { width: still.width as number, height: still.height as number }, HERO_SIZE[record.aspect]);
    const pasted = path.join(workDir, "pasted.mp4");
    const scores = await pasteClip(outputPath(rawFile), pasted, packshotPath, protectMaskPath, align, path.join(workDir, "frames"));
    await postVfx(pasted, outputPath(finalFile), DEFAULT_POST_VFX);
    // The weakest frame is the honest score for a clip.
    return { outputFile: finalFile, extraFiles: { raw: rawFile }, labelMatch: { final: Math.min(...scores), model: null } };
  } catch (error: unknown) {
    console.error("clip paste failed", record.id, error);
    return { status: "failed", errorType: "clip_paste_failed", errorMessage: "The clip rendered, but the label could not be restored on every frame.", extraFiles: { raw: rawFile } };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

// Polls can overlap while a slow post-step runs; one sync per job at a time.
const inFlight = new Map<string, Promise<StageJob>>();

/** Rebuild the Comfy job from its stored ID, persist the new state, and collect the outputs once. */
export function syncJob(record: StageJob): Promise<StageJob> {
  if (TERMINAL_STATUSES.includes(record.status)) return Promise.resolve(record);
  const running = inFlight.get(record.id);
  if (running) return running;
  const sync = syncOnce(record).finally(() => inFlight.delete(record.id));
  inFlight.set(record.id, sync);
  return sync;
}

async function syncOnce(record: StageJob): Promise<StageJob> {

  const job = await new Comfy().jobs.get(record.comfyJobId);
  const status = job.status as JobStatus;
  const error = job.error as { code?: string; message?: string } | null;
  let next: StageJob = {
    ...record,
    status,
    queuePosition: job.queuePosition,
    errorType: error ? (error.code ?? "failed") : null,
    errorMessage: error?.message ? error.message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH) : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    updatedAt: new Date().toISOString(),
  };

  if (status === "succeeded" && !record.outputFile) {
    const kind = OUTPUT_KIND[record.stage];
    const { outputNode, extraOutputs } = stageOutputs(record.stage);
    // Pick by node, since a workflow may save several images. Comfy Cloud reports SaveVideo
    // outputs as type "image", so the kind check uses the MIME type.
    const output = job.getOutputs(outputNode).find((candidate) => candidate.contentType.startsWith(`${kind}/`));
    if (output) {
      const file = `${record.id}.${OUTPUT_EXTENSION[kind]}`;
      await saveOutput(output, file);
      const extraFiles: Record<string, string> = {};
      for (const [name, node] of Object.entries(extraOutputs ?? {})) {
        const extra = job.getOutputs(node)[0];
        if (!extra) continue;
        extraFiles[name] = `${record.id}.${name}.${OUTPUT_EXTENSION.image}`;
        await saveOutput(extra, extraFiles[name]);
      }
      next = { ...next, outputFile: file, outputKind: kind, extraFiles };
      if (record.glyphPaste) next = { ...next, ...(await finishGlyphPaste(record, file)) };
      if (record.clipPaste) next = { ...next, ...(await finishClipPaste(record, file)) };
    } else {
      next = { ...next, status: "failed", errorType: `no_${kind}_output`, errorMessage: `The workflow finished without an ${kind} output at node ${outputNode}.` };
    }
  }

  await writeJson(jobFile(record.id), next);
  return next;
}

export function toView(record: StageJob): JobView {
  return {
    id: record.id,
    stage: record.stage,
    runId: record.runId,
    label: record.label,
    aspect: record.aspect,
    seed: record.seed,
    comfyJobId: record.comfyJobId,
    status: record.status,
    queuePosition: record.queuePosition,
    errorType: record.errorType,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    outputUrl: record.outputFile ? `/api/jobs/${record.id}/output` : null,
    outputKind: record.outputKind,
    rawUrl: record.extraFiles?.raw ? `/api/jobs/${record.id}/output?file=raw` : null,
    labelMatch: record.labelMatch?.final ?? null,
    modelLabelMatch: record.labelMatch?.model ?? null,
    waitTimeoutSeconds: WAIT_TIMEOUT_SECONDS,
  };
}

/** Map SDK failures to an HTTP status and a message a user can act on. Never includes credentials. */
export function describeError(error: unknown): { status: number; error: string; code?: string } {
  if (error instanceof InsufficientCredits) {
    return { status: 402, error: "The Comfy workspace is out of credits. Add credits at platform.comfy.org, then try again.", code: error.code };
  }
  if (error instanceof MissingCredentials || error instanceof Unauthorized) {
    return { status: 500, error: "The server's Comfy API key is missing or invalid.", code: error.code };
  }
  if (error instanceof Forbidden) {
    return { status: 403, error: "This Comfy workspace is not allowed to run workflows.", code: error.code };
  }
  if (error instanceof QueueFull) {
    return { status: 429, error: "Comfy Cloud's queue is full. Try again in a minute.", code: error.code };
  }
  if (error instanceof ComfyError) {
    return { status: 502, error: `Comfy request failed: ${error.message}`, code: error.code };
  }
  console.error("unexpected job error", error);
  return { status: 500, error: "Unexpected server error." };
}
