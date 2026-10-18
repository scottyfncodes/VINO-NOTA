import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import sharp, { type Metadata } from "sharp";
import { getDb } from "@/server/db";
import { wine, wineImage } from "@/server/db/schema";
import { NotFoundError, UserFacingError } from "@/server/errors";
import { getStorage, StorageUnavailableError } from "@/server/storage";
import { isUuid } from "@/lib/domain/ids";

/** Uploads are resized in the browser first; this is a hard server-side ceiling. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type ImageSize = "thumb" | "display" | "original";
export type ImageType = "front_label" | "back_label" | "bottle" | "other";

export type ProcessedImage = {
  original: Buffer;
  display: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
};

/**
 * Validates by decoding (not by trusting the declared MIME type), applies EXIF
 * orientation, strips all metadata (including GPS) and produces derivatives.
 */
export async function processImage(bytes: Buffer): Promise<ProcessedImage> {
  if (bytes.byteLength === 0) throw new UserFacingError("The image file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UserFacingError("That image is too large. Please use a photo under 4 MB.", 413);
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new UserFacingError("That file could not be read as an image.", 415);
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new UserFacingError("Please upload a JPEG, PNG, WebP or HEIC photo.", 415);
  }
  const base = () => sharp(bytes, { limitInputPixels: 60_000_000, failOn: "error" }).rotate();
  try {
    const original = await base().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const [display, thumb] = await Promise.all([
      base().resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      base().resize({ width: 480, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
    ]);
    return { original: original.data, display, thumb, width: original.info.width, height: original.info.height };
  } catch {
    throw new UserFacingError("That image appears to be damaged and could not be processed.", 415);
  }
}

export async function uploadImage(
  userId: string,
  bytes: Buffer,
  options: { imageType?: ImageType; wineId?: string | null; source?: "camera" | "user_upload" } = {},
) {
  const db = getDb();
  if (options.wineId) {
    if (!isUuid(options.wineId)) throw new NotFoundError("Wine");
    const owned = await db.query.wine.findFirst({ where: and(eq(wine.id, options.wineId), eq(wine.ownerId, userId)), columns: { id: true } });
    if (!owned) throw new NotFoundError("Wine");
  }
  const processed = await processImage(bytes);
  // Remove this user's abandoned capture uploads first. Awaited (not detached) so the
  // work finishes within the request and can never race the upload created below.
  await cleanupPendingImages(userId).catch(() => {
    console.error("[images] pending-upload cleanup failed");
  });
  const id = crypto.randomUUID();
  const prefix = `images/${userId}/${id}`;
  const keys = { originalKey: `${prefix}/original.jpg`, displayKey: `${prefix}/display.webp`, thumbKey: `${prefix}/thumb.webp` };
  const storage = getStorage();
  try {
    await storage.put(keys.originalKey, processed.original, "image/jpeg");
    await storage.put(keys.displayKey, processed.display, "image/webp");
    await storage.put(keys.thumbKey, processed.thumb, "image/webp");
  } catch (error) {
    await safeDeleteObjects(Object.values(keys));
    if (error instanceof StorageUnavailableError) {
      throw new UserFacingError("Photo storage isn't configured yet, so images can't be saved. You can still record the wine without a photo.", 503);
    }
    console.error("[images] storage write failed:", error instanceof Error ? error.message : "unknown");
    throw new UserFacingError("The photo couldn't be saved. Please try again.", 502);
  }
  const [row] = await db
    .insert(wineImage)
    .values({
      id,
      ownerId: userId,
      wineId: options.wineId ?? null,
      imageType: options.imageType ?? "front_label",
      ...keys,
      width: processed.width,
      height: processed.height,
      byteSize: processed.original.byteLength,
      source: options.source ?? "user_upload",
    })
    .returning();
  return row;
}

export async function getImageForUser(userId: string, imageId: string, size: ImageSize) {
  const db = getDb();
  const row = await db.query.wineImage.findFirst({ where: and(eq(wineImage.id, imageId), eq(wineImage.ownerId, userId)) });
  if (!row) return null;
  const key = size === "thumb" ? row.thumbKey : size === "display" ? row.displayKey : row.originalKey;
  return getStorage().get(key);
}

/** Reads an image's original derivative (used for recognition). */
export async function getOriginalBytes(userId: string, imageId: string): Promise<Buffer | null> {
  const obj = await getImageForUser(userId, imageId, "original");
  if (!obj) return null;
  if (Buffer.isBuffer(obj.body)) return obj.body;
  return Buffer.from(await new Response(obj.body).arrayBuffer());
}

export function storageKeysOf(rows: { originalKey: string; displayKey: string; thumbKey: string }[]) {
  return rows.flatMap((r) => [r.originalKey, r.displayKey, r.thumbKey]);
}

/** Deletes stored objects; failures are logged (without user data) rather than thrown. */
export async function safeDeleteObjects(keys: string[]) {
  if (!keys.length) return;
  try {
    await getStorage().delete(keys);
  } catch (error) {
    console.error(`[images] failed to delete ${keys.length} stored object(s):`, error instanceof Error ? error.message : "unknown");
  }
}

export async function deleteImage(userId: string, imageId: string) {
  if (!isUuid(imageId)) throw new NotFoundError("Image");
  const db = getDb();
  const [row] = await db.delete(wineImage).where(and(eq(wineImage.id, imageId), eq(wineImage.ownerId, userId))).returning();
  if (!row) throw new NotFoundError("Image");
  await safeDeleteObjects(storageKeysOf([row]));
}

export async function cleanupPendingImages(userId: string, now = Date.now()) {
  const db = getDb();
  const stale = await db
    .delete(wineImage)
    .where(and(eq(wineImage.ownerId, userId), isNull(wineImage.wineId), lt(wineImage.createdAt, new Date(now - PENDING_TTL_MS))))
    .returning();
  await safeDeleteObjects(storageKeysOf(stale));
  return stale.length;
}

/** Attach pending (capture) uploads to a wine. Only the owner's unattached images are affected. */
export async function attachPendingImages(tx: Pick<ReturnType<typeof getDb>, "update">, userId: string, wineId: string, imageIds: string[]) {
  if (!imageIds.length) return;
  await tx
    .update(wineImage)
    .set({ wineId })
    .where(and(inArray(wineImage.id, imageIds), eq(wineImage.ownerId, userId), isNull(wineImage.wineId)));
}
