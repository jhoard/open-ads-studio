import { Comfy, ComfyError, Forbidden, InsufficientCredits, MissingCredentials, QueueFull, Unauthorized } from "@comfyorg/sdk";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { TERMINAL_STATUSES, type FileRef, type JobStatus, type JobView, type OutputKind, type StageJob, type StageName, type StageParams } from "@/lib/types";
import { alignBySilhouette, silhouetteBox } from "./align-silhouette";
import { WAIT_TIMEOUT_SECONDS, dataPath } from "./config";
import { alignToClip, pasteClip } from "./clip-paste";
import { HERO_SIZE } from "./geometry";
import { alignPackshot, pasteGlyphs, placedGlyphMask, type Alignment, type PasteOptions } from "./glyph-paste";
import { DEFAULT_POST_VFX, postVfx } from "./post-vfx";
import { localFile, store, storeFile, workDir, type Stored } from "./store";
import { buildWorkflow, stageOutputs } from "./workflows";

const MAX_ERROR_MESSAGE_LENGTH = 500;
// A post-step claimed longer ago than this is assumed abandoned (its function instance died) and may be retaken.
const CLAIM_STALE_MS = 6 * 60 * 1000;

const jobKey = (id: string): string => `jobs/${id}.json`;
const idempotencyKeyKey = (key: string): string => `jobs/keys/${key}.json`;
const outputKey = (file: string): string => `outputs/${file}`;

/** Local path of an output in the filesystem store, for scripts that run on this machine. */
export const outputPath = (file: string): string => dataPath("outputs", file);
/** A local copy of an output, from whichever store is active. */
export const localOutput = (file: string): Promise<string> => localFile(outputKey(file));
/** A stored output's bytes, for the output route. */
export const readOutput = (file: string): Promise<Buffer | null> => store().readFile(outputKey(file));
/** The FileRef of a stored output, for job inputs that outlive this request. */
export const outputRef = (file: string): FileRef => `store:${outputKey(file)}`;

/** A local path for a FileRef: bundled files as they are, stored files downloaded. */
export async function resolveRef(ref: FileRef): Promise<string> {
  return ref.startsWith("store:") ? localFile(ref.slice("store:".length)) : ref;
}

const loadJob = (id: string): Promise<Stored<StageJob> | null> => store().readJson<StageJob>(jobKey(id));

export async function findJob(id: string): Promise<StageJob | null> {
  return (await loadJob(id))?.value ?? null;
}

export async function findJobByKey(key: string): Promise<StageJob | null> {
  const ref = await store().readJson<{ id: string }>(idempotencyKeyKey(key));
  return ref ? findJob(ref.value.id) : null;
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
  cutout: "image",
};
const OUTPUT_EXTENSION: Record<OutputKind, string> = { image: "png", video: "mp4" };
const CONTENT_TYPE: Record<OutputKind, string> = { image: "image/png", video: "video/mp4" };

interface CreateJobInput {
  id: string;
  stage: StageName;
  runId: string;
  label: string;
  idempotencyKey: string;
  params: StageParams;
  glyphPaste?: StageJob["glyphPaste"];
  clipPaste?: StageJob["clipPaste"];
  visitor?: string;
}

export async function createJob({ id, stage, runId, label, idempotencyKey, params, glyphPaste, clipPaste, visitor }: CreateJobInput): Promise<StageJob> {
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
    ...(visitor ? { visitor } : {}),
  };
  await store().writeJson(jobKey(id), record);
  await store().writeJson(idempotencyKeyKey(idempotencyKey), { id });
  return record;
}

type ComfyJob = Awaited<ReturnType<InstanceType<typeof Comfy>["jobs"]["get"]>>;
type JobOutput = ComfyJob["outputs"][number];

/** Download a Comfy output to scratch space and store it. Returns the local copy. */
async function saveOutput(output: JobOutput, file: string, kind: OutputKind): Promise<string> {
  const local = workDir("outputs", file);
  await mkdir(path.dirname(local), { recursive: true });
  await output.toFile(local);
  await storeFile(outputKey(file), local, CONTENT_TYPE[kind]);
  return local;
}

/** Submit a BiRefNet cutout of a stored output (the silhouette alignment's first half). */
async function submitCutout(localImage: string): Promise<string> {
  const client = new Comfy();
  const workflow = await buildWorkflow(client, "cutout", { imagePath: localImage, aspect: "3:4", prompt: "", seed: 0 });
  return (await client.submit(workflow)).id;
}

type Placement = "green-box" | "silhouette";

async function pasteOptions(paste: NonNullable<StageJob["glyphPaste"]>, placement: Placement): Promise<PasteOptions> {
  if (placement !== "silhouette" || !paste.packshotCutout) return {};
  // The product box comes from its own cutout. Uploads assume no glossy surface, so no mirrored reflection.
  return { box: await silhouetteBox(await resolveRef(paste.packshotCutout)), reflection: paste.align === "best" };
}

interface PasteOutcome {
  update: Partial<StageJob>;
  score: number;
}

/** Place the packshot on the model's output one way, paste the protected glyphs back, and store the result. */
async function pasteWith(record: StageJob, rawFile: string, rawLocal: string, placement: Placement, renderCutout: string | null, suffix: string): Promise<PasteOutcome> {
  const paste = record.glyphPaste as NonNullable<StageJob["glyphPaste"]>;
  const [packshot, mask] = await Promise.all([resolveRef(paste.packshotPath), resolveRef(paste.protectMaskPath)]);
  const align: Alignment =
    placement === "silhouette" && renderCutout && paste.packshotCutout
      ? await alignBySilhouette(packshot, await resolveRef(paste.packshotCutout), rawLocal, renderCutout, mask)
      : await alignPackshot(packshot, rawLocal, mask);
  const finalFile = `${record.id}.final${suffix}.png`;
  const finalLocal = workDir("outputs", finalFile);
  const result = await pasteGlyphs(packshot, rawLocal, mask, align, finalLocal, await pasteOptions(paste, placement));
  await storeFile(outputKey(finalFile), finalLocal, "image/png");
  const glyphsFile = `${record.id}.glyphs${suffix}.png`;
  const canvas = await sharp(rawLocal).metadata();
  const glyphs = await placedGlyphMask(packshot, mask, align, { width: canvas.width as number, height: canvas.height as number });
  await store().putFile(outputKey(glyphsFile), glyphs, "image/png");
  return {
    score: result.labelMatch,
    update: { outputFile: finalFile, extraFiles: { raw: rawFile, glyphs: glyphsFile }, labelMatch: { final: result.labelMatch, model: result.modelLabelMatch }, alignment: align },
  };
}

/** Scene post-step: place and paste by the job's mode; "best" tries both placements and keeps the higher label match. */
async function finishGlyphPaste(record: StageJob, rawFile: string, rawLocal: string, renderCutout: string | null): Promise<Partial<StageJob>> {
  const mode = record.glyphPaste?.align ?? "green-box";
  try {
    if (mode !== "best") return (await pasteWith(record, rawFile, rawLocal, mode, renderCutout, "")).update;
    const green = await pasteWith(record, rawFile, rawLocal, "green-box", null, "");
    const silhouette = renderCutout ? await pasteWith(record, rawFile, rawLocal, "silhouette", renderCutout, "-silhouette").catch(() => null) : null;
    const scores = { greenBox: green.score, silhouette: silhouette?.score ?? null };
    const winner = silhouette && silhouette.score > green.score ? silhouette : green;
    return { ...winner.update, alignmentScores: scores };
  } catch (error: unknown) {
    console.error("glyph paste failed", record.id, error);
    return { status: "failed", errorType: "glyph_paste_failed", errorMessage: "The scene rendered, but the label could not be located and restored.", extraFiles: { raw: rawFile } };
  }
}

/** Cinemagraph post-step: glyph paste on every frame, each tone-matched, then the first and last frame holds. */
async function finishClipPaste(record: StageJob, rawLocal: string, rawFile: string): Promise<Partial<StageJob>> {
  const paste = record.clipPaste as NonNullable<StageJob["clipPaste"]>;
  const finalFile = `${record.id}.final.mp4`;
  const scratch = workDir("clip", record.id);
  try {
    const [still, packshot, mask] = await Promise.all([resolveRef(paste.stillPath), resolveRef(paste.packshotPath), resolveRef(paste.protectMaskPath)]);
    const stillSize = await sharp(still).metadata();
    const stillAlign = paste.alignment ?? (await alignPackshot(packshot, still, mask));
    const align = alignToClip(stillAlign, { width: stillSize.width as number, height: stillSize.height as number }, HERO_SIZE[record.aspect]);
    const pasted = path.join(scratch, "pasted.mp4");
    const scores = await pasteClip(rawLocal, pasted, packshot, mask, align, path.join(scratch, "frames"), { reflection: paste.reflection ?? true });
    const finalLocal = workDir("outputs", finalFile);
    await postVfx(pasted, finalLocal, DEFAULT_POST_VFX);
    await storeFile(outputKey(finalFile), finalLocal, "video/mp4");
    // The weakest frame is the honest score for a clip.
    return { outputFile: finalFile, extraFiles: { raw: rawFile }, labelMatch: { final: Math.min(...scores), model: null } };
  } catch (error: unknown) {
    console.error("clip paste failed", record.id, error);
    return { status: "failed", errorType: "clip_paste_failed", errorMessage: "The clip rendered, but the label could not be restored on every frame.", extraFiles: { raw: rawFile } };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

// Polls can overlap while a slow post-step runs; one sync per job at a time per instance.
const inFlight = new Map<string, Promise<StageJob>>();

/** Rebuild the Comfy job from its stored ID, persist the new state, and collect the outputs once. */
export function syncJob(record: StageJob): Promise<StageJob> {
  if (TERMINAL_STATUSES.includes(record.status)) return Promise.resolve(record);
  const running = inFlight.get(record.id);
  if (running) return running;
  const sync = syncOnce(record.id, record).finally(() => inFlight.delete(record.id));
  inFlight.set(record.id, sync);
  return sync;
}

const claimFresh = (record: StageJob): boolean => Boolean(record.post?.claimedAt && Date.now() - Date.parse(record.post.claimedAt) < CLAIM_STALE_MS);

function comfyState(job: ComfyJob): Pick<StageJob, "status" | "queuePosition" | "errorType" | "errorMessage" | "startedAt" | "completedAt"> {
  const error = job.error as { code?: string; message?: string } | null;
  return {
    status: job.status as JobStatus,
    queuePosition: job.queuePosition,
    errorType: error ? (error.code ?? "failed") : null,
    errorMessage: error?.message ? error.message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH) : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

async function syncOnce(id: string, fallback: StageJob): Promise<StageJob> {
  const stored = (await loadJob(id)) ?? { value: fallback, etag: "" };
  const record = stored.value;
  if (TERMINAL_STATUSES.includes(record.status)) return record;
  // Another instance is finishing this job: report it as still running.
  if (claimFresh(record)) return record;

  const client = new Comfy();
  if (record.post?.cutoutJobId) return syncPostCutout(stored, client);

  const job = await client.jobs.get(record.comfyJobId);
  const state = comfyState(job);
  const now = new Date().toISOString();
  if (state.status !== "succeeded" || record.outputFile) {
    const next = { ...record, ...state, updatedAt: now };
    await store().writeJson(jobKey(id), next);
    return next;
  }

  // Succeeded: claim the post-step so exactly one instance downloads and finishes it.
  const claimed: StageJob = { ...record, ...state, status: "running", completedAt: null, post: { ...record.post, claimedAt: now }, updatedAt: now };
  if (!(await store().writeJson(jobKey(id), claimed, stored.etag ? { ifMatch: stored.etag } : {}))) return record;

  const kind = OUTPUT_KIND[record.stage];
  const { outputNode, extraOutputs } = stageOutputs(record.stage);
  // Pick by node, since a workflow may save several images. Comfy Cloud reports SaveVideo
  // outputs as type "image", so the kind check uses the MIME type.
  const output = job.getOutputs(outputNode).find((candidate) => candidate.contentType.startsWith(`${kind}/`));
  if (!output) {
    return finish(claimed, { ...state, status: "failed", errorType: `no_${kind}_output`, errorMessage: `The workflow finished without an ${kind} output at node ${outputNode}.` });
  }
  const file = `${record.id}.${OUTPUT_EXTENSION[kind]}`;
  const local = await saveOutput(output, file, kind);
  const extraFiles: Record<string, string> = {};
  for (const [name, node] of Object.entries(extraOutputs ?? {})) {
    const extra = job.getOutputs(node)[0];
    if (!extra) continue;
    extraFiles[name] = `${record.id}.${name}.${OUTPUT_EXTENSION.image}`;
    await saveOutput(extra, extraFiles[name], "image");
  }
  const base: Partial<StageJob> = { ...state, outputFile: file, outputKind: kind, extraFiles };

  const paste = record.glyphPaste;
  if (paste && (paste.align === "silhouette" || paste.align === "best")) {
    // Cut the product out of the render first (and, once, Tauvel's packshot); the paste runs when they land.
    const cutoutJobId = await submitCutout(local);
    const needsPackshotCutout = paste.packshotCutout ? !(await refExists(paste.packshotCutout)) : false;
    const packshotCutoutJobId = needsPackshotCutout ? await submitCutout(await resolveRef(paste.packshotPath)) : undefined;
    return finish(claimed, { ...base, outputFile: null, status: "running", completedAt: null, post: { cutoutJobId, rawFile: file, ...(packshotCutoutJobId ? { packshotCutoutJobId } : {}) } });
  }
  if (record.glyphPaste) return finish(claimed, { ...base, ...(await finishGlyphPaste(record, file, local, null)) });
  if (record.clipPaste) return finish(claimed, { ...base, ...(await finishClipPaste(record, local, file)) });
  return finish(claimed, base);
}

/** Second half of the silhouette alignment: once the cutouts land, align and paste. */
async function syncPostCutout(stored: Stored<StageJob>, client: Comfy): Promise<StageJob> {
  const record = stored.value;
  const post = record.post as NonNullable<StageJob["post"]>;
  const jobs = await Promise.all([post.cutoutJobId, post.packshotCutoutJobId].map((jobId) => (jobId ? client.jobs.get(jobId) : null)));
  if (jobs.some((job) => job && !TERMINAL_STATUSES.includes(job.status as JobStatus))) return record;
  const now = new Date().toISOString();
  const claimed: StageJob = { ...record, post: { ...post, claimedAt: now }, updatedAt: now };
  if (!(await store().writeJson(jobKey(record.id), claimed, { ifMatch: stored.etag }))) return record;

  const [renderJob, packshotJob] = jobs;
  const imageOf = (job: ComfyJob | null): JobOutput | undefined => (job?.status === "succeeded" ? job.getOutputs("3").find((candidate) => candidate.contentType.startsWith("image/")) : undefined);
  const rawFile = post.rawFile as string;
  const paste = record.glyphPaste as NonNullable<StageJob["glyphPaste"]>;

  const packshotOutput = imageOf(packshotJob);
  if (packshotOutput && paste.packshotCutout?.startsWith("store:")) {
    await saveToKey(packshotOutput, paste.packshotCutout.slice("store:".length));
  }
  const renderOutput = imageOf(renderJob);
  const silhouetteReady = Boolean(renderOutput) && (paste.packshotCutout ? await refExists(paste.packshotCutout) : false);
  if (!silhouetteReady && paste.align === "silhouette") {
    return finish(claimed, { status: "failed", errorType: "cutout_failed", errorMessage: "The scene rendered, but the product could not be cut out of it to place the label.", extraFiles: { raw: rawFile } });
  }
  const renderCutout = silhouetteReady && renderOutput ? await saveOutput(renderOutput, `${record.id}.render-cutout.png`, "image") : null;
  const rawLocal = await localOutput(rawFile);
  const result = await finishGlyphPaste(record, rawFile, rawLocal, renderCutout);
  return finish(claimed, { status: "succeeded", completedAt: now, ...result });
}

async function refExists(ref: FileRef): Promise<boolean> {
  if (!ref.startsWith("store:")) return true;
  return (await store().readFile(ref.slice("store:".length))) !== null;
}

/** Download a Comfy output straight to a storage key (no output-file naming). */
async function saveToKey(output: JobOutput, key: string): Promise<void> {
  const local = workDir("keys", key);
  await mkdir(path.dirname(local), { recursive: true });
  await output.toFile(local);
  await storeFile(key, local, "image/png");
}

/** Write the job's next state. The claim is dropped; a new post-step state is kept only when the update sets one. */
async function finish(claimed: StageJob, update: Partial<StageJob>): Promise<StageJob> {
  const { post: _claim, ...base } = claimed;
  const next: StageJob = { ...base, ...update, updatedAt: new Date().toISOString() };
  await store().writeJson(jobKey(claimed.id), next);
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
    glyphsUrl: record.extraFiles?.glyphs ? `/api/jobs/${record.id}/output?file=glyphs` : null,
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
