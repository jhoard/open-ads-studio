import { Comfy, ComfyError, Forbidden, InsufficientCredits, MissingCredentials, QueueFull, Unauthorized } from "@comfyorg/sdk";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { TERMINAL_STATUSES, type JobStatus, type JobView, type OutputKind, type StageJob, type StageName, type StageParams } from "@/lib/types";
import { WAIT_TIMEOUT_SECONDS, dataPath } from "./config";
import { buildWorkflow } from "./workflows";

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

const OUTPUT_KIND: Record<StageName, OutputKind> = { scene: "image", "vfx-ltx": "video", "vfx-reveal": "video" };
const OUTPUT_EXTENSION: Record<OutputKind, string> = { image: "png", video: "mp4" };

interface CreateJobInput {
  id: string;
  stage: StageName;
  runId: string;
  label: string;
  idempotencyKey: string;
  params: StageParams;
}

export async function createJob({ id, stage, runId, label, idempotencyKey, params }: CreateJobInput): Promise<StageJob> {
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
  };
  await writeJson(jobFile(id), record);
  await writeJson(keyFile(idempotencyKey), { id });
  return record;
}

/** Rebuild the Comfy job from its stored ID, persist the new state, and collect the video once. */
export async function syncJob(record: StageJob): Promise<StageJob> {
  if (TERMINAL_STATUSES.includes(record.status)) return record;

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
    // Comfy Cloud reports SaveVideo outputs as type "image", so match on the MIME type.
    const output = job.outputs.find((candidate) => candidate.contentType.startsWith(`${kind}/`));
    if (output) {
      const file = `${record.id}.${OUTPUT_EXTENSION[kind]}`;
      const tmp = outputPath(`${file}.${randomUUID()}.tmp`);
      await mkdir(path.dirname(tmp), { recursive: true });
      await output.toFile(tmp);
      await rename(tmp, outputPath(file));
      next = { ...next, outputFile: file, outputKind: kind };
    } else {
      next = { ...next, status: "failed", errorType: `no_${kind}_output`, errorMessage: `The workflow finished without an ${kind} output.` };
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
