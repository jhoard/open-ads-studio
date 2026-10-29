"use client";

import { useCallback, useEffect, useState } from "react";
import { TERMINAL_STATUSES, type ApiError, type JobView } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;
const RETRY_INTERVAL_MS = 6000;
const JOB_PARAM = "job";

function setJobParam(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(JOB_PARAM, id);
  else url.searchParams.delete(JOB_PARAM);
  window.history.replaceState(null, "", url);
}

async function readJson<T>(response: Response): Promise<T | ApiError> {
  try {
    return (await response.json()) as T | ApiError;
  } catch {
    return { error: `Server returned ${response.status}.` };
  }
}

export interface UseJob {
  job: JobView | null;
  error: string | null;
  submitting: boolean;
  submit: (image: File, idempotencyKey: string) => Promise<void>;
  reset: () => void;
}

/** Submit once, then poll the stored job ID. The ID lives in the URL, so a refresh resumes the same job. */
export function useJob(): UseJob {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const refresh = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      const body = await readJson<JobView>(response);
      if ("error" in body) {
        setError(body.error);
        if (response.status === 404) {
          setJob(null);
          setJobParam(null);
        } else {
          setTimeout(() => setRetryTick((tick) => tick + 1), RETRY_INTERVAL_MS);
        }
        return;
      }
      setError(null);
      setJob(body);
    } catch {
      setError("Lost connection to the server. Retrying.");
      setTimeout(() => setRetryTick((tick) => tick + 1), RETRY_INTERVAL_MS);
    }
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(JOB_PARAM);
    if (id) void refresh(id);
  }, [refresh]);

  useEffect(() => {
    if (!job || TERMINAL_STATUSES.includes(job.status)) return;
    const timer = setTimeout(() => void refresh(job.id), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [job, refresh, retryTick]);

  const submit = useCallback(async (image: File, idempotencyKey: string): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", image);
      form.set("idempotencyKey", idempotencyKey);
      const response = await fetch("/api/jobs", { method: "POST", body: form });
      const body = await readJson<JobView>(response);
      if ("error" in body) {
        setError(body.error);
        return;
      }
      setJob(body);
      setJobParam(body.id);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }, []);

  const reset = useCallback((): void => {
    setJob(null);
    setError(null);
    setJobParam(null);
  }, []);

  return { job, error, submitting, submit, reset };
}
