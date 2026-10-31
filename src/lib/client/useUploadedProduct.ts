"use client";

import { useCallback, useEffect, useState } from "react";
import type { MaskBox } from "@/lib/glyph-mask";
import type { UploadedProductView } from "@/lib/studio";
import type { ApiError } from "@/lib/types";

const POLL_INTERVAL_MS = 2500;
const STORAGE_KEY = "open-ads-studio.upload";

export interface UseUploadedProduct {
  product: UploadedProductView | null;
  busy: boolean;
  error: string | null;
  upload: (file: File, name: string) => Promise<void>;
  saveMask: (boxes: MaskBox[], threshold: number) => Promise<boolean>;
  forget: () => void;
}

async function readJson<T>(response: Response): Promise<T | ApiError> {
  try {
    return (await response.json()) as T | ApiError;
  } catch {
    return { error: `Server returned ${response.status}.` };
  }
}

function remember(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the upload still works for this visit.
  }
}

/** One uploaded product per browser: upload, wait for the cutout, then save the label mask. */
export function useUploadedProduct(): UseUploadedProduct {
  const [product, setProduct] = useState<UploadedProductView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string): Promise<void> => {
    const body = await readJson<UploadedProductView>(await fetch(`/api/products/${id}`, { cache: "no-store" }));
    if (!("id" in body)) {
      remember(null);
      setProduct(null);
      return;
    }
    setProduct(body);
  }, []);

  useEffect(() => {
    let id: string | null = null;
    try {
      id = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      id = null;
    }
    if (id) void load(id).catch(() => undefined);
  }, [load]);

  // Poll while BiRefNet cuts the product out.
  useEffect(() => {
    if (product?.status !== "cutting") return;
    const timer = setTimeout(() => void load(product.id).catch(() => undefined), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [product, load]);

  const upload = useCallback(async (file: File, name: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", file);
      form.set("name", name);
      const body = await readJson<UploadedProductView>(await fetch("/api/products", { method: "POST", body: form }));
      if (!("id" in body)) {
        setError(body.error);
        return;
      }
      remember(body.id);
      setProduct(body);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const saveMask = useCallback(
    async (boxes: MaskBox[], threshold: number): Promise<boolean> => {
      if (!product) return false;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/products/${product.id}/mask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boxes, threshold }),
        });
        const body = await readJson<UploadedProductView>(response);
        if (!("id" in body)) {
          setError(body.error);
          return false;
        }
        setProduct(body);
        return true;
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [product],
  );

  const forget = useCallback((): void => {
    remember(null);
    setProduct(null);
    setError(null);
  }, []);

  return { product, busy, error, upload, saveMask, forget };
}
