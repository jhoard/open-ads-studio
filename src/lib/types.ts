export type StageName = "vfx-ltx";

export type JobStatus = "queued" | "running" | "canceling" | "succeeded" | "canceled" | "failed" | "expired";

export const TERMINAL_STATUSES: readonly JobStatus[] = ["succeeded", "canceled", "failed", "expired"];

export interface StageJob {
  id: string;
  idempotencyKey: string;
  stage: StageName;
  comfyJobId: string;
  status: JobStatus;
  queuePosition: number | null;
  errorType: string | null;
  errorMessage: string | null;
  outputFile: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** What the browser sees: no filesystem paths, no Comfy internals beyond the job ID. */
export interface JobView {
  id: string;
  stage: StageName;
  comfyJobId: string;
  status: JobStatus;
  queuePosition: number | null;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  videoUrl: string | null;
  waitTimeoutSeconds: number;
}

export interface ApiError {
  error: string;
  code?: string;
}
