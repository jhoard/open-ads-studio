import { BlobNotFoundError, BlobPreconditionFailedError, get, put, type GetBlobResult } from "@vercel/blob";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DATA_ROOT } from "./config";

// Where job records, uploads and outputs live. Local runs use the var/ folder; a deployment with a
// BLOB_READ_WRITE_TOKEN uses a private Vercel Blob store, read from origin so every function
// instance sees the latest job state. Keys are POSIX-style paths, for example "jobs/<id>.json".

export interface Stored<T> {
  value: T;
  /** Opaque version tag for conditional writes. */
  etag: string;
}

export interface Store {
  readonly kind: "fs" | "blob";
  readJson<T>(key: string): Promise<Stored<T> | null>;
  /** Write JSON. With ifMatch, only if the stored version is still that one; returns false on conflict. */
  writeJson(key: string, value: unknown, options?: { ifMatch?: string }): Promise<boolean>;
  putFile(key: string, data: Buffer, contentType: string): Promise<void>;
  readFile(key: string): Promise<Buffer | null>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]*$/i;

function checkKey(key: string): string {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

const etagOf = (data: Buffer | string): string => createHash("sha1").update(data).digest("hex");

class FsStore implements Store {
  readonly kind = "fs" as const;

  private file(key: string): string {
    return path.join(/*turbopackIgnore: true*/ DATA_ROOT, checkKey(key));
  }

  async readJson<T>(key: string): Promise<Stored<T> | null> {
    const raw = await this.readFile(key);
    return raw ? { value: JSON.parse(raw.toString("utf8")) as T, etag: etagOf(raw) } : null;
  }

  async writeJson(key: string, value: unknown, options: { ifMatch?: string } = {}): Promise<boolean> {
    if (options.ifMatch !== undefined) {
      const current = await this.readFile(key);
      if (!current || etagOf(current) !== options.ifMatch) return false;
    }
    await this.putFile(key, Buffer.from(JSON.stringify(value, null, 2)), "application/json");
    return true;
  }

  async putFile(key: string, data: Buffer, _contentType?: string): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  }

  async readFile(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.file(key));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}

async function getFresh(key: string): Promise<Extract<GetBlobResult, { statusCode: 200 }> | null> {
  try {
    const result = await get(checkKey(key), { access: "private", useCache: false });
    return result && result.statusCode === 200 ? result : null;
  } catch (error: unknown) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

class BlobStore implements Store {
  readonly kind = "blob" as const;

  async readJson<T>(key: string): Promise<Stored<T> | null> {
    const result = await getFresh(key);
    if (!result) return null;
    const text = await new Response(result.stream).text();
    return { value: JSON.parse(text) as T, etag: result.blob.etag };
  }

  async writeJson(key: string, value: unknown, options: { ifMatch?: string } = {}): Promise<boolean> {
    try {
      await put(checkKey(key), JSON.stringify(value), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        ...(options.ifMatch ? { ifMatch: options.ifMatch } : {}),
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof BlobPreconditionFailedError) return false;
      throw error;
    }
  }

  async putFile(key: string, data: Buffer, contentType: string): Promise<void> {
    await put(checkKey(key), data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  }

  async readFile(key: string): Promise<Buffer | null> {
    const result = await getFresh(key);
    if (!result) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
}

let instance: Store | null = null;

export function store(): Store {
  instance ??= process.env.BLOB_READ_WRITE_TOKEN ? new BlobStore() : new FsStore();
  return instance;
}

/** Scratch directory for processing: var/ locally, /tmp on a deployment. */
export const workDir = (...parts: string[]): string =>
  path.join(/*turbopackIgnore: true*/ process.env.VERCEL ? path.join(os.tmpdir(), "open-ads-studio") : DATA_ROOT, "work", ...parts);

/**
 * A local file for a stored key, for tools that need a path (sharp, ffmpeg, Comfy uploads).
 * The filesystem store returns the file in place; the blob store downloads once per instance.
 */
export async function localFile(key: string): Promise<string> {
  const s = store();
  if (s.kind === "fs") return path.join(/*turbopackIgnore: true*/ DATA_ROOT, checkKey(key));
  const file = workDir("cache", checkKey(key));
  try {
    await stat(file);
    return file;
  } catch {
    const data = await s.readFile(key);
    if (!data) throw new Error(`Missing stored file: ${key}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return file;
  }
}

/** Store a local file under a key. */
export async function storeFile(key: string, file: string, contentType: string): Promise<void> {
  const s = store();
  const target = s.kind === "fs" ? path.join(/*turbopackIgnore: true*/ DATA_ROOT, checkKey(key)) : null;
  if (target && path.resolve(target) === path.resolve(file)) return;
  await s.putFile(key, await readFile(file), contentType);
}
