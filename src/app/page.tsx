"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useJob } from "@/lib/client/useJob";
import { TERMINAL_STATUSES, type JobView } from "@/lib/types";

const STATUS_LABELS: Record<JobView["status"], string> = {
  queued: "Queued",
  running: "Generating",
  canceling: "Canceling",
  succeeded: "Ready",
  canceled: "Canceled",
  failed: "Failed",
  expired: "Expired",
};

function useElapsedSeconds(job: JobView | null): number {
  const [now, setNow] = useState(() => Date.now());
  const active = job !== null && !TERMINAL_STATUSES.includes(job.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  if (!job) return 0;
  const end = job.completedAt ? Date.parse(job.completedAt) : now;
  return Math.max(0, Math.round((end - Date.parse(job.createdAt)) / 1000));
}

const formatSeconds = (total: number): string => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

function StatusCard({ job, elapsed }: { job: JobView; elapsed: number }) {
  const pastThreshold = !TERMINAL_STATUSES.includes(job.status) && elapsed > job.waitTimeoutSeconds;
  return (
    <div className={`status-${job.status}`}>
      <div className="status" role="status" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />
        {STATUS_LABELS[job.status]}
        {job.status === "queued" && job.queuePosition !== null ? ` (position ${job.queuePosition})` : null}
      </div>
      <p className="meta">
        {formatSeconds(elapsed)} elapsed · Comfy job <code>{job.comfyJobId.slice(0, 8)}</code>
      </p>
      {pastThreshold ? (
        <p className="notice">
          Past the {job.waitTimeoutSeconds}s wait threshold. Comfy Cloud is still working, so we keep checking the same job. Nothing is resubmitted.
        </p>
      ) : null}
      {job.errorType ? (
        <p className="notice notice-error">
          <strong>error_type: {job.errorType}</strong>
          {job.errorMessage ? ` ${job.errorMessage}` : null}
        </p>
      ) : null}
    </div>
  );
}

export default function StudioPage() {
  const { job, error, submitting, submit, reset } = useJob();
  const [image, setImage] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const elapsed = useElapsedSeconds(job);
  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const busy = submitting || (job !== null && !TERMINAL_STATUSES.includes(job.status));

  function onPick(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    setImage(file);
    // One key per chosen image: a double click or retry replays instead of paying twice.
    setIdempotencyKey(crypto.randomUUID());
    reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (image && idempotencyKey) void submit(image, idempotencyKey);
  }

  return (
    <main className="studio">
      <header className="studio-header">
        <h1>Open Ads Studio</h1>
        <p>Product photo in, a short VFX clip with native audio out. Open-weight LTX-2, running as a ComfyUI workflow on Comfy Cloud.</p>
      </header>

      <div className="workspace">
        <form className="panel" onSubmit={onSubmit} aria-labelledby="input-heading">
          <h2 id="input-heading">1 · Product photo</h2>
          <label className="dropzone">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} disabled={busy} />
            {previewUrl ? <img src={previewUrl} alt="Selected product" /> : <span>Choose a PNG, JPEG or WebP</span>}
          </label>
          <button className="button" type="submit" disabled={!image || busy}>
            {submitting ? "Submitting" : busy ? "Generating" : "Generate VFX clip"}
          </button>
          {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
        </form>

        <section className="panel" aria-labelledby="output-heading">
          <h2 id="output-heading">2 · VFX clip</h2>
          {job ? <StatusCard job={job} elapsed={elapsed} /> : <p className="meta">Nothing generated yet.</p>}
          {job?.outputUrl ? (
            <>
              <video className="player" src={job.outputUrl} controls playsInline loop />
              <a className="button" href={`${job.outputUrl}?download=1`} download>
                Download MP4
              </a>
            </>
          ) : (
            <div className="placeholder">{busy ? "Rendering on Comfy Cloud" : "Your clip appears here"}</div>
          )}
          <p className="model-credit">Model: LTX-2 19B distilled (open weights), image-to-video with audio. Workflow: workflows/vfx-ltx.json</p>
        </section>
      </div>
    </main>
  );
}
