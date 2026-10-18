import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { providerUsage } from "@/server/db/schema";
import { getOriginalBytes } from "@/server/images";
import { AnthropicLabelProvider } from "./anthropic";
import type { LabelRecognitionProvider, RecognitionOutcome } from "./types";

export * from "./types";

const providers: LabelRecognitionProvider[] = [new AnthropicLabelProvider()];
let override: LabelRecognitionProvider | null | undefined;

/** Test hook: inject a provider (or null to force "unconfigured"). */
export function setRecognitionProviderForTesting(p: LabelRecognitionProvider | null | undefined) {
  override = p;
}

export function getRecognitionProvider(): LabelRecognitionProvider | null {
  if (override !== undefined) return override;
  return providers.find((p) => p.isConfigured()) ?? null;
}

export function recognitionStatus() {
  const p = getRecognitionProvider();
  return p ? { available: true as const, provider: p.displayName } : { available: false as const, provider: null };
}

const HOURLY_LIMIT = 30;

/** Fixed one-hour window counter per user. Returns false when over the limit. */
export async function consumeRecognitionQuota(userId: string, now = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const key = `recognition:${userId}`;
  const [row] = await getDb()
    .insert(providerUsage)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [providerUsage.key, providerUsage.windowStart], set: { count: sql`${providerUsage.count} + 1` } })
    .returning({ count: providerUsage.count });
  // Keep the table small.
  void getDb()
    .delete(providerUsage)
    .where(and(eq(providerUsage.key, key), sql`${providerUsage.windowStart} < ${new Date(windowStart.getTime() - 86_400_000)}`))
    .catch(() => {});
  return row.count <= HOURLY_LIMIT;
}

/** Recognise a previously uploaded label image owned by the user. */
export async function recognizeLabel(userId: string, imageId: string): Promise<RecognitionOutcome> {
  const provider = getRecognitionProvider();
  if (!provider) {
    return { status: "unavailable", reason: "Automatic label recognition isn't set up for this journal. Enter the details from the label below." };
  }
  if (!(await consumeRecognitionQuota(userId))) {
    return { status: "failed", reason: "You've reached the hourly limit for label recognition. Enter the details yourself or try again later.", retryable: false };
  }
  const bytes = await getOriginalBytes(userId, imageId);
  if (!bytes) return { status: "failed", reason: "That photo could not be found. Please retake it.", retryable: false };
  return provider.recognize({ bytes, mediaType: "image/jpeg" });
}
