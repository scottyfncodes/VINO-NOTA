import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { providerUsage } from "@/server/db/schema";
import { getOriginalBytes } from "@/server/images";
import { lookupCatalog } from "@/server/reference/lookup";
import { enrichFromCatalog } from "@/lib/domain/catalog";
import { countryCodeFromName, countryName } from "@/lib/domain/countries";
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

/**
 * Global ceiling on label readings across every account, per UTC day. Sign-up is
 * open and each reading is a paid model call, so per-user limits alone don't bound
 * spend. Override with AI_GLOBAL_DAILY_LIMIT; unset or invalid means the default,
 * "0" pauses recognition. There is deliberately no "unlimited" value.
 */
export const DEFAULT_GLOBAL_DAILY_LIMIT = 300;
const GLOBAL_KEY = "global:recognition";

export function globalDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AI_GLOBAL_DAILY_LIMIT?.trim();
  if (!raw) return DEFAULT_GLOBAL_DAILY_LIMIT;
  if (!/^\d+$/.test(raw)) {
    console.warn(`[recognition] AI_GLOBAL_DAILY_LIMIT is not a whole number; using the default of ${DEFAULT_GLOBAL_DAILY_LIMIT}`);
    return DEFAULT_GLOBAL_DAILY_LIMIT;
  }
  return Number(raw);
}

function utcDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

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

/** Gives back one per-user reading that was counted but not used. */
async function refundRecognitionQuota(userId: string, now: Date) {
  const windowStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  await getDb()
    .update(providerUsage)
    .set({ count: sql`${providerUsage.count} - 1` })
    .where(and(eq(providerUsage.key, `recognition:${userId}`), eq(providerUsage.windowStart, windowStart), sql`${providerUsage.count} > 0`));
}

/**
 * Takes one reading from today's global budget. The check and the increment are a
 * single statement (the row is only bumped while under the limit), so parallel
 * requests can't push the count past the limit. Returns false when the day is spent.
 */
export async function consumeGlobalRecognitionBudget(now = new Date(), limit = globalDailyLimit()) {
  if (limit <= 0) return false;
  const windowStart = utcDayStart(now);
  const rows = await getDb()
    .insert(providerUsage)
    .values({ key: GLOBAL_KEY, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [providerUsage.key, providerUsage.windowStart],
      set: { count: sql`${providerUsage.count} + 1` },
      setWhere: sql`${providerUsage.count} < ${limit}`,
    })
    .returning({ count: providerUsage.count });
  // Keep a week of daily totals for the owner; drop older ones.
  void getDb()
    .delete(providerUsage)
    .where(and(eq(providerUsage.key, GLOBAL_KEY), sql`${providerUsage.windowStart} < ${new Date(windowStart.getTime() - 7 * 86_400_000)}`))
    .catch(() => {});
  return rows.length > 0;
}

export const GLOBAL_LIMIT_REASON =
  "Label reading is paused for today because the journal has reached its daily limit. Your photo and entries are safe. Enter the details from the label, or try reading it again tomorrow.";

/** Recognise a previously uploaded label image owned by the user. */
export async function recognizeLabel(userId: string, imageId: string, now = new Date()): Promise<RecognitionOutcome> {
  const provider = getRecognitionProvider();
  if (!provider) {
    return { status: "unavailable", reason: "Automatic label recognition isn't set up for this journal. Enter the details from the label below." };
  }
  if (!(await consumeRecognitionQuota(userId, now))) {
    return { status: "failed", reason: "You've reached the hourly limit for label recognition. Enter the details yourself or try again later.", retryable: false };
  }
  const bytes = await getOriginalBytes(userId, imageId);
  if (!bytes) return { status: "failed", reason: "That photo could not be found. Please retake it.", retryable: false };
  const limit = globalDailyLimit();
  if (!(await consumeGlobalRecognitionBudget(now, limit))) {
    // No model call was made, so this attempt doesn't count against the user either.
    await refundRecognitionQuota(userId, now).catch(() => {});
    // Counts only, never user or label data.
    console.warn(`[recognition] event=global_daily_limit_reached limit=${limit} day=${utcDayStart(now).toISOString().slice(0, 10)}`);
    return { status: "failed", reason: GLOBAL_LIMIT_REASON, retryable: false };
  }
  const outcome = await provider.recognize({ bytes, mediaType: "image/jpeg" });
  return outcome.status === "ok" ? withCatalog(outcome) : outcome;
}

/**
 * Completes a label reading from the reference catalog: one bounded database
 * lookup, no further AI calls. Vintage, non-vintage and alcohol are never
 * touched; label values always win and disagreements are reported.
 */
export async function withCatalog(outcome: Extract<RecognitionOutcome, { status: "ok" }>): Promise<RecognitionOutcome> {
  const c = outcome.candidate;
  const { evidence, matches } = await lookupCatalog({
    producer: c.producer.value,
    name: c.name.value,
    country: c.country.value,
    region: c.region.value,
    appellation: c.appellation.value,
  });
  if (!matches.length) return outcome;
  const { fields, filled, agreed, conflicts } = enrichFromCatalog(c, evidence, countryCodeFromName, countryName);
  const candidate = { ...c, ...fields };
  for (const f of filled) candidate[f] = { ...candidate[f], source: `catalog:${candidate[f].source ?? "unknown"}` } as never;
  return { ...outcome, candidate, catalog: { filled, agreed, conflicts, matches } };
}
