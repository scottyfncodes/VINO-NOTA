import { del, get, put } from "@vercel/blob";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Private object storage. Keys are opaque and never exposed as public URLs. */
export interface ObjectStorage {
  readonly kind: "vercel-blob" | "local" | "unconfigured";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}

class VercelBlobStorage implements ObjectStorage {
  readonly kind = "vercel-blob" as const;
  async put(key: string, body: Buffer, contentType: string) {
    await put(key, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  }
  async get(key: string) {
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, contentType: result.blob.contentType };
  }
  async delete(keys: string[]) {
    if (keys.length) await del(keys);
  }
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "storage");

class LocalStorage implements ObjectStorage {
  readonly kind = "local" as const;
  constructor(private root = LOCAL_ROOT) {}
  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return target;
  }
  async put(key: string, body: Buffer, contentType: string) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.type`, contentType);
  }
  async get(key: string) {
    try {
      const file = this.resolve(key);
      const [body, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
      return { body, contentType };
    } catch {
      return null;
    }
  }
  async delete(keys: string[]) {
    await Promise.all(keys.map((k) => Promise.all([rm(this.resolve(k), { force: true }), rm(`${this.resolve(k)}.type`, { force: true })])));
  }
}

class UnconfiguredStorage implements ObjectStorage {
  readonly kind = "unconfigured" as const;
  async put(): Promise<void> {
    throw new StorageUnavailableError();
  }
  async get() {
    return null;
  }
  async delete() {}
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("Image storage is not configured.");
    this.name = "StorageUnavailableError";
  }
}

let override: ObjectStorage | null = null;

/** Test hook. */
export function setStorageForTesting(storage: ObjectStorage | null) {
  override = storage;
}

export function getStorage(): ObjectStorage {
  if (override) return override;
  // A connected Blob store provides either a read-write token or, for OIDC-authenticated
  // stores, BLOB_STORE_ID (the SDK then uses the deployment's OIDC token).
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return new VercelBlobStorage();
  // Never write to the (ephemeral, shared) filesystem on Vercel.
  if (process.env.VERCEL) return new UnconfiguredStorage();
  return new LocalStorage();
}

export { LocalStorage };
