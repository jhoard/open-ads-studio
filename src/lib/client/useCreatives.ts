"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecipeId } from "@/lib/recipes";
import type { Creative } from "@/lib/studio";
import { TERMINAL_STATUSES, type ApiError, type JobView } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;
const STORAGE_KEY = "open-ads-studio.creatives";

export interface CreateRequest {
  recipe: RecipeId;
  directionId?: string;
}

export interface UseCreatives {
  creatives: Creative[];
  approved: Set<string>;
  error: string | null;
  submitting: boolean;
  create: (requests: CreateRequest[]) => Promise<void>;
  toggleApproved: (id: string) => void;
  remove: (id: string) => void;
}

// Browser storage is a convenience only: creatives survive a refresh, and an empty or blocked store just starts fresh.
function loadStored(): { creatives: Creative[]; approved: string[] } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { creatives: [], approved: [] };
    const parsed = JSON.parse(raw) as { creatives?: Creative[]; approved?: string[] };
    return { creatives: parsed.creatives ?? [], approved: parsed.approved ?? [] };
  } catch {
    return { creatives: [], approved: [] };
  }
}

function store(creatives: Creative[], approved: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ creatives, approved: [...approved] }));
  } catch {
    // Storage unavailable (private window, blocked site data): keep working in memory.
  }
}

async function readJson<T>(response: Response): Promise<T | ApiError> {
  try {
    return (await response.json()) as T | ApiError;
  } catch {
    return { error: `Server returned ${response.status}.` };
  }
}

const isRunning = (creative: Creative): boolean => !creative.demo && !TERMINAL_STATUSES.includes(creative.status);

/** Submit recipes, poll each running job, and keep the set across refreshes. */
export function useCreatives(): UseCreatives {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const stored = loadStored();
    setCreatives(stored.creatives);
    setApproved(new Set(stored.approved));
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (loaded.current) store(creatives, approved);
  }, [creatives, approved]);

  const running = creatives.filter(isRunning).map((creative) => creative.id).join(",");
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(async () => {
      const ids = running.split(",");
      const updates = await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
            const body = await readJson<JobView>(response);
            return "error" in body ? null : body;
          } catch {
            return null;
          }
        }),
      );
      setCreatives((current) =>
        current.map((creative) => {
          const update = updates.find((candidate) => candidate?.id === creative.id);
          return update ? { ...creative, ...update } : creative;
        }),
      );
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [running, creatives]);

  const create = useCallback(async (requests: CreateRequest[]): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const results = await Promise.all(
        requests.map(async (request) => {
          const response = await fetch("/api/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...request, idempotencyKey: crypto.randomUUID() }),
          });
          return readJson<Creative>(response);
        }),
      );
      const failures = results.filter((result): result is ApiError => "error" in result);
      const made = results.filter((result): result is Creative => !("error" in result));
      if (failures.length) setError(failures.map((failure) => failure.error).join(" "));
      setCreatives((current) => [...made, ...current]);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }, []);

  const toggleApproved = useCallback((id: string): void => {
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const remove = useCallback((id: string): void => {
    setCreatives((current) => current.filter((creative) => creative.id !== id));
    setApproved((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  return { creatives, approved, error, submitting, create, toggleApproved, remove };
}
