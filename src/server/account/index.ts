import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { user, userPreferences, wineImage } from "@/server/db/schema";
import { safeDeleteObjects, storageKeysOf } from "@/server/images";
import { UserFacingError } from "@/server/errors";
import { isCurrencyCode } from "@/lib/domain/currency";

/**
 * Permanently deletes the account. Every private record is removed through
 * ON DELETE CASCADE; stored photo files are removed afterwards.
 */
export async function deleteAccount(userId: string) {
  const db = getDb();
  const images = await db.query.wineImage.findMany({ where: eq(wineImage.ownerId, userId), columns: { originalKey: true, displayKey: true, thumbKey: true } });
  await db.delete(user).where(eq(user.id, userId));
  await safeDeleteObjects(storageKeysOf(images));
  return { deletedImages: images.length };
}

export async function getPreferences(userId: string) {
  const row = await getDb().query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });
  return { defaultCurrency: row?.defaultCurrency ?? "USD" };
}

export async function updatePreferences(userId: string, prefs: { defaultCurrency: string }) {
  const currency = prefs.defaultCurrency.trim().toUpperCase();
  if (!isCurrencyCode(currency)) throw new UserFacingError("Use a three-letter currency code, such as USD or EUR.");
  await getDb()
    .insert(userPreferences)
    .values({ userId, defaultCurrency: currency })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { defaultCurrency: currency, updatedAt: new Date() } });
  return { defaultCurrency: currency };
}
