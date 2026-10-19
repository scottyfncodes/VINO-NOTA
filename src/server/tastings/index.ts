import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "@/server/db";
import { sensoryObservation, tasting, tastingTag, wine } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { attachPendingImages } from "@/server/images";
import { recordContribution } from "@/server/reference/contributions";
import { createWineTx, isUuid, parseWineInput, recordMetadataSource } from "@/server/catalog/wines";
import { descriptorCategory } from "@/lib/domain/sensory";
import { formatIssues, tastingInputSchema, type TastingInput, type TastingInputRaw } from "@/lib/domain/validation";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function parseTastingInput(raw: unknown): TastingInput {
  const parsed = tastingInputSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(formatIssues(parsed.error));
  return parsed.data;
}

function tastingColumns(input: TastingInput) {
  const num = (v: number | null) => (v === null ? null : String(v));
  return {
    tastedOn: input.tastedOn,
    personalScore: num(input.personalScore),
    purchasePrice: num(input.purchasePrice),
    currency: input.currency,
    priceBasis: input.purchasePrice === null ? null : (input.priceBasis ?? "retail_bottle"),
    venue: input.venue,
    occasion: input.occasion,
    foodPairing: input.foodPairing,
    wouldBuyAgain: input.wouldBuyAgain,
    blindStatus: input.blindStatus,
    blindGuess: input.blindStatus === "not_blind" ? null : input.blindGuess,
    impression: input.impression,
    notes: input.notes,
    servingTempC: num(input.servingTempC),
    decantMinutes: input.decantMinutes,
    bottleProvenance: input.bottleProvenance,
    storageNotes: input.storageNotes,
  };
}

async function writeChildren(tx: Tx, tastingId: string, input: TastingInput) {
  await tx.delete(sensoryObservation).where(eq(sensoryObservation.tastingId, tastingId));
  await tx.delete(tastingTag).where(eq(tastingTag.tastingId, tastingId));
  if (input.observations.length) {
    const seenDescriptors = new Set<string>();
    const rows = input.observations
      .filter((o) => {
        if (o.dimension !== "aroma" && o.dimension !== "flavor") return true;
        const k = `${o.dimension}:${o.descriptor?.toLowerCase()}`;
        if (seenDescriptors.has(k)) return false;
        seenDescriptors.add(k);
        return true;
      })
      .map((o) => ({
        tastingId,
        dimension: o.dimension,
        status: o.status,
        value: o.value,
        descriptor: o.descriptor,
        category: o.category ?? (o.descriptor && (o.dimension === "aroma" || o.dimension === "flavor") ? descriptorCategory(o.descriptor) : null),
        intensity: o.intensity,
        source: "user" as const,
      }));
    if (rows.length) await tx.insert(sensoryObservation).values(rows);
  }
  if (input.tags.length) {
    await tx.insert(tastingTag).values(input.tags.map((tag) => ({ tastingId, tag })));
  }
}

export async function createTastingTx(tx: Tx, userId: string, wineId: string, input: TastingInput) {
  const owned = isUuid(wineId) && (await tx.query.wine.findFirst({ where: and(eq(wine.id, wineId), eq(wine.ownerId, userId)), columns: { id: true } }));
  if (!owned) throw new NotFoundError("Wine");
  const [row] = await tx.insert(tasting).values({ ownerId: userId, wineId, ...tastingColumns(input) }).returning();
  await writeChildren(tx, row.id, input);
  await tx.update(wine).set({ updatedAt: new Date() }).where(eq(wine.id, wineId));
  return row;
}

export async function createTasting(userId: string, wineId: string, raw: TastingInputRaw | unknown) {
  const input = parseTastingInput(raw);
  return getDb().transaction((tx) => createTastingTx(tx, userId, wineId, input));
}

/** Edits one tasting. Other tastings of the same wine are never touched. */
export async function updateTasting(userId: string, tastingId: string, raw: unknown) {
  const input = parseTastingInput(raw);
  return getDb().transaction(async (tx) => {
    if (!isUuid(tastingId)) throw new NotFoundError("Tasting");
    const [row] = await tx
      .update(tasting)
      .set({ ...tastingColumns(input), updatedAt: new Date() })
      .where(and(eq(tasting.id, tastingId), eq(tasting.ownerId, userId)))
      .returning();
    if (!row) throw new NotFoundError("Tasting");
    await writeChildren(tx, row.id, input);
    return row;
  });
}

export async function deleteTasting(userId: string, tastingId: string) {
  if (!isUuid(tastingId)) throw new NotFoundError("Tasting");
  const [row] = await getDb()
    .delete(tasting)
    .where(and(eq(tasting.id, tastingId), eq(tasting.ownerId, userId)))
    .returning({ id: tasting.id, wineId: tasting.wineId });
  if (!row) throw new NotFoundError("Tasting");
  return row;
}

export async function getTasting(userId: string, tastingId: string) {
  if (!isUuid(tastingId)) throw new NotFoundError("Tasting");
  const db = getDb();
  const row = await db.query.tasting.findFirst({ where: and(eq(tasting.id, tastingId), eq(tasting.ownerId, userId)) });
  if (!row) throw new NotFoundError("Tasting");
  const [observations, tags] = await Promise.all([
    db.query.sensoryObservation.findMany({ where: eq(sensoryObservation.tastingId, tastingId) }),
    db.query.tastingTag.findMany({ where: eq(tastingTag.tastingId, tastingId), orderBy: asc(tastingTag.tag) }),
  ]);
  return { ...row, observations, tags: tags.map((t) => t.tag) };
}

export type TastingWithChildren = Awaited<ReturnType<typeof getTasting>>;

/** All tastings for a wine, newest first, each with its own observations and tags. */
export async function listTastingsForWine(userId: string, wineId: string) {
  const db = getDb();
  const rows = await db.query.tasting.findMany({
    where: and(eq(tasting.wineId, wineId), eq(tasting.ownerId, userId)),
    orderBy: (t, { desc }) => [desc(t.tastedOn), desc(t.createdAt)],
  });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [observations, tags] = await Promise.all([
    db.query.sensoryObservation.findMany({ where: inArray(sensoryObservation.tastingId, ids) }),
    db.query.tastingTag.findMany({ where: inArray(tastingTag.tastingId, ids) }),
  ]);
  return rows.map((r) => ({
    ...r,
    observations: observations.filter((o) => o.tastingId === r.id),
    tags: tags.filter((t) => t.tastingId === r.id).map((t) => t.tag),
  }));
}

export function tastingToInput(t: TastingWithChildren): TastingInputRaw {
  return {
    tastedOn: t.tastedOn,
    personalScore: t.personalScore === null ? null : Number(t.personalScore),
    purchasePrice: t.purchasePrice === null ? null : Number(t.purchasePrice),
    currency: t.currency,
    priceBasis: t.priceBasis,
    venue: t.venue,
    occasion: t.occasion,
    foodPairing: t.foodPairing,
    wouldBuyAgain: t.wouldBuyAgain,
    blindStatus: t.blindStatus,
    blindGuess: t.blindGuess,
    impression: t.impression,
    notes: t.notes,
    servingTempC: t.servingTempC === null ? null : Number(t.servingTempC),
    decantMinutes: t.decantMinutes,
    bottleProvenance: t.bottleProvenance,
    storageNotes: t.storageNotes,
    observations: t.observations.map((o) => ({
      dimension: o.dimension,
      status: o.status,
      value: o.value,
      descriptor: o.descriptor,
      category: (o.category as "primary" | "secondary" | "tertiary" | null) ?? null,
      intensity: o.intensity,
    })),
    tags: t.tags,
  };
}

export type CapturePayload = {
  /** Add the tasting to this existing wine… */
  wineId?: string | null;
  /** …or create a new wine with this identity. */
  wine?: unknown;
  tasting: unknown;
  imageIds?: string[];
  recognition?: {
    provider: string;
    imageId: string | null;
    extractedText: string | null;
    candidate: unknown;
    confidence: number | null;
  } | null;
};

/**
 * Saves a complete capture atomically: the wine identity (new or existing),
 * the new tasting, attached photos and the recognition provenance record.
 */
export async function saveCapture(userId: string, payload: CapturePayload) {
  const tastingInput = parseTastingInput(payload.tasting);
  const wineInput = payload.wineId ? null : parseWineInput(payload.wine);
  const imageIds = (payload.imageIds ?? []).filter(isUuid).slice(0, 6);
  return getDb().transaction(async (tx) => {
    let wineId: string;
    if (payload.wineId) {
      const owned = isUuid(payload.wineId) && (await tx.query.wine.findFirst({ where: and(eq(wine.id, payload.wineId), eq(wine.ownerId, userId)), columns: { id: true } }));
      if (!owned) throw new NotFoundError("Wine");
      wineId = payload.wineId;
      await attachPendingImages(tx, userId, wineId, imageIds);
    } else {
      const created = await createWineTx(tx, userId, wineInput!, imageIds);
      wineId = created.id;
      await recordContribution(tx, userId, wineInput!);
    }
    const t = await createTastingTx(tx, userId, wineId, tastingInput);
    if (payload.recognition) {
      const r = payload.recognition;
      await recordMetadataSource(tx, userId, {
        wineId,
        imageId: r.imageId && isUuid(r.imageId) ? r.imageId : null,
        provider: String(r.provider).slice(0, 60),
        extractedText: r.extractedText ? String(r.extractedText).slice(0, 4000) : null,
        candidate: r.candidate ?? null,
        confidence: typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : null,
      });
    }
    return { wineId, tastingId: t.id };
  });
}
