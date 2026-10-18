import { afterEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "@/server/storage";

afterEach(() => vi.unstubAllEnvs());

describe("storage selection", () => {
  it("uses Vercel Blob with an OIDC-connected store id", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_abc");
    expect(getStorage().kind).toBe("vercel-blob");
  });
  it("uses Vercel Blob with a read-write token", () => {
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_x");
    expect(getStorage().kind).toBe("vercel-blob");
  });
  it("refuses to fall back to the filesystem on Vercel", () => {
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    expect(getStorage().kind).toBe("unconfigured");
  });
  it("uses local storage in development", () => {
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    expect(getStorage().kind).toBe("local");
  });
});
