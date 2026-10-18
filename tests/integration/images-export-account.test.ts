import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { closeDb, getDb } from "@/server/db";
import { tasting, user, wine, wineImage } from "@/server/db/schema";
import { cleanupPendingImages, deleteImage, getImageForUser, processImage, uploadImage } from "@/server/images";
import { createWine, deleteWine, getWineDetail } from "@/server/catalog/wines";
import { createTasting, saveCapture } from "@/server/tastings";
import { buildAccountExport, buildWineExport, exportToCsv, EXPORT_FORMAT } from "@/server/export";
import { deleteAccount, getPreferences, updatePreferences } from "@/server/account";
import { recognizeLabel, setRecognitionProviderForTesting, type LabelRecognitionProvider } from "@/server/recognition";
import { NotFoundError, UserFacingError } from "@/server/errors";
import { setStorageForTesting, type ObjectStorage } from "@/server/storage";
import { baseTasting, baseWine, createUser, sampleJpeg, useTempStorage } from "../support/fixtures";

let dir: string;
beforeAll(() => {
  dir = useTempStorage().dir;
});
afterAll(async () => {
  setStorageForTesting(null);
  setRecognitionProviderForTesting(undefined);
  await closeDb();
});

async function storedFiles() {
  try {
    return (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".jpg") || f.endsWith(".webp"));
  } catch {
    return [];
  }
}

describe("image processing", () => {
  it("strips metadata, keeps orientation and produces three derivatives", async () => {
    const p = await processImage(await sampleJpeg(3000, 4000));
    expect(p.width).toBeLessThanOrEqual(2400);
    const meta = await sharp(p.original).metadata();
    expect(meta.exif).toBeUndefined();
    expect((await sharp(p.thumb).metadata()).width).toBeLessThanOrEqual(480);
  });

  it("rejects non-images, empty files and oversized uploads", async () => {
    await expect(processImage(Buffer.from("<svg onload=alert(1)>"))).rejects.toBeInstanceOf(UserFacingError);
    await expect(processImage(Buffer.alloc(0))).rejects.toBeInstanceOf(UserFacingError);
    await expect(processImage(Buffer.alloc(5 * 1024 * 1024, 1))).rejects.toMatchObject({ status: 413 });
  });

  it("uploads, attaches on capture and serves only to the owner", async () => {
    const owner = await createUser("img-owner");
    const other = await createUser("img-other");
    const img = await uploadImage(owner, await sampleJpeg());
    expect(img.wineId).toBeNull();
    expect(await getImageForUser(other, img.id, "thumb")).toBeNull();
    expect(await getImageForUser(owner, img.id, "thumb")).not.toBeNull();
    // Another user cannot attach someone else's pending upload.
    const stolen = await saveCapture(other, { wine: { ...baseWine, name: "Thief" }, tasting: baseTasting, imageIds: [img.id] });
    expect((await getWineDetail(other, stolen.wineId)).images).toHaveLength(0);
    const r = await saveCapture(owner, { wine: { ...baseWine, name: "With photo" }, tasting: baseTasting, imageIds: [img.id] });
    expect((await getWineDetail(owner, r.wineId)).images.map((i) => i.id)).toEqual([img.id]);
  });

  it("rejects uploading to another user's wine", async () => {
    const a = await createUser("img-a");
    const b = await createUser("img-b");
    const w = await createWine(a, baseWine);
    await expect(uploadImage(b, await sampleJpeg(), { wineId: w.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("answers malformed ids with not-found instead of a database error", async () => {
    const owner = await createUser("malformed");
    await expect(uploadImage(owner, await sampleJpeg(), { wineId: "not-a-uuid" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteImage(owner, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes stored files when a wine is deleted", async () => {
    const u = await createUser("img-del");
    const w = await createWine(u, baseWine);
    const img = await uploadImage(u, await sampleJpeg(), { wineId: w.id });
    const before = await storedFiles();
    expect(before.some((f) => f.includes(img.id))).toBe(true);
    await deleteWine(u, w.id);
    expect((await storedFiles()).some((f) => f.includes(img.id))).toBe(false);
  });

  it("cleans up abandoned pending uploads", async () => {
    const u = await createUser("img-pending");
    const img = await uploadImage(u, await sampleJpeg());
    await getDb().update(wineImage).set({ createdAt: new Date(Date.now() - 48 * 3600 * 1000) }).where(eq(wineImage.id, img.id));
    // Any background work from the upload must not have touched the backdated row.
    await new Promise((r) => setTimeout(r, 60));
    expect(await cleanupPendingImages(u)).toBe(1);
    expect((await storedFiles()).some((f) => f.includes(img.id))).toBe(false);
  });

  it("removes abandoned uploads on the next upload, but never the new one", async () => {
    const u = await createUser("img-next");
    const stale = await uploadImage(u, await sampleJpeg());
    await getDb().update(wineImage).set({ createdAt: new Date(Date.now() - 48 * 3600 * 1000) }).where(eq(wineImage.id, stale.id));
    const fresh = await uploadImage(u, await sampleJpeg());
    const rows = await getDb().select({ id: wineImage.id }).from(wineImage).where(eq(wineImage.ownerId, u));
    expect(rows.map((r) => r.id)).toEqual([fresh.id]);
  });

  it("reports a storage failure without leaving rows or partial files", async () => {
    const u = await createUser("img-fail");
    const failing: ObjectStorage = {
      kind: "local",
      put: async () => {
        throw new Error("disk full");
      },
      get: async () => null,
      delete: async () => {},
    };
    setStorageForTesting(failing);
    try {
      await expect(uploadImage(u, await sampleJpeg())).rejects.toMatchObject({ status: 502 });
      expect(await getDb().select().from(wineImage).where(eq(wineImage.ownerId, u))).toHaveLength(0);
    } finally {
      useTempStorage();
    }
  });
});

describe("recognition provider boundary", () => {
  it("reports an honest unavailable state when no provider is configured", async () => {
    setRecognitionProviderForTesting(null);
    const u = await createUser("rec");
    const r = await recognizeLabel(u, crypto.randomUUID());
    expect(r.status).toBe("unavailable");
  });

  it("uses an injected provider and only for the owner's image", async () => {
    const calls: number[] = [];
    const fake: LabelRecognitionProvider = {
      id: "fake",
      displayName: "Fake",
      isConfigured: () => true,
      recognize: async ({ bytes }) => {
        calls.push(bytes.length);
        return { status: "failed", reason: "test", retryable: true };
      },
    };
    setRecognitionProviderForTesting(fake);
    const owner = await createUser("rec-owner");
    const other = await createUser("rec-other");
    const img = await uploadImage(owner, await sampleJpeg());
    expect((await recognizeLabel(other, img.id)).status).toBe("failed");
    expect(calls).toHaveLength(0);
    await recognizeLabel(owner, img.id);
    expect(calls).toHaveLength(1);
  });
});

describe("export", () => {
  it("exports every record with currency, provenance and missing values intact", async () => {
    const u = await createUser("exporter");
    const w = await createWine(u, { ...baseWine, provenance: { name: { source: "provider", provider: "anthropic", confidence: 0.9 } } });
    await createTasting(u, w.id, baseTasting);
    await createTasting(u, w.id, { tastedOn: "2026-05-01", observations: [{ dimension: "tannin", status: "not_applicable" }] });
    const data = await buildAccountExport(u);
    expect(data.format).toBe(EXPORT_FORMAT);
    expect(data.wines).toHaveLength(1);
    expect(data.wines[0].fieldProvenance.name.source).toBe("provider");
    expect(data.wines[0].grapes).toHaveLength(2);
    expect(data.tastings).toHaveLength(2);
    const unrated = data.tastings.find((t) => t.tastedOn === "2026-05-01")!;
    expect(unrated.personalScore).toBeNull();
    expect(unrated.observations).toEqual([expect.objectContaining({ dimension: "tannin", status: "not_applicable", value: null })]);
    const rated = data.tastings.find((t) => t.tastedOn === "2026-03-14")!;
    expect([rated.purchasePrice, rated.currency]).toEqual([55, "USD"]);
    expect(JSON.stringify(data)).not.toContain("images/");
    expect(data.regions.map((r) => r.name).sort()).toEqual(["Bordeaux", "Médoc"]);
  });

  it("produces CSV with one row per tasting and neutralised formulas", async () => {
    const u = await createUser("csv");
    const w = await createWine(u, { ...baseWine, name: "=HYPERLINK(\"x\")" });
    await createTasting(u, w.id, { ...baseTasting, notes: 'Line one\nwith "quotes", commas' });
    const csv = exportToCsv(await buildAccountExport(u));
    const lines = csv.trim().split("\r\n");
    expect(lines[0].startsWith("tasting_id,tasted_on,personal_score")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Line one\nwith ""quotes"", commas"');
  });

  it("scopes a single-wine export and does not leak other users' wines", async () => {
    const u = await createUser("wine-export");
    const v = await createUser("wine-export-other");
    const w1 = await createWine(u, { ...baseWine, name: "One" });
    await createWine(u, { ...baseWine, name: "Two", producer: "Someone Else" });
    const foreign = await createWine(v, baseWine);
    const data = await buildWineExport(u, w1.id);
    expect(data.wines.map((w) => w.name)).toEqual(["One"]);
    expect(data.producers).toHaveLength(1);
    expect(data.account).toBeUndefined();
    await expect(buildWineExport(u, foreign.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("account", () => {
  it("stores preferences with validation", async () => {
    const u = await createUser("prefs");
    expect(await getPreferences(u)).toEqual({ defaultCurrency: "USD" });
    await updatePreferences(u, { defaultCurrency: "eur" });
    expect(await getPreferences(u)).toEqual({ defaultCurrency: "EUR" });
    await expect(updatePreferences(u, { defaultCurrency: "euros" })).rejects.toBeInstanceOf(UserFacingError);
  });

  it("deletes the account, every record and every stored file", async () => {
    const u = await createUser("leaver");
    const keep = await createUser("stayer");
    const w = await createWine(u, baseWine);
    await createTasting(u, w.id, baseTasting);
    const img = await uploadImage(u, await sampleJpeg(), { wineId: w.id });
    const kept = await createWine(keep, baseWine);
    const result = await deleteAccount(u);
    expect(result.deletedImages).toBe(1);
    const db = getDb();
    expect(await db.select().from(user).where(eq(user.id, u))).toHaveLength(0);
    expect(await db.select().from(wine).where(eq(wine.ownerId, u))).toHaveLength(0);
    expect(await db.select().from(tasting).where(eq(tasting.ownerId, u))).toHaveLength(0);
    expect((await storedFiles()).some((f) => f.includes(img.id))).toBe(false);
    expect((await getWineDetail(keep, kept.id)).id).toBe(kept.id);
  });
});
