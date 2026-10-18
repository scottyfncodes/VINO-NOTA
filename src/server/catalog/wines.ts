import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, type Database } from "@/server/db";
import {
  metadataSourceRecord,
  producer,
  region,
  tasting,
  wine,
  wineGrape,
  wineImage,
  type FieldProvenance,
} from "@/server/db/schema";
import { NotFoundError, UserFacingError, ValidationError } from "@/server/errors";
import { attachPendingImages, safeDeleteObjects, storageKeysOf } from "@/server/images";
import { normalizeProducer, normalizeText, wineIdentityKey } from "@/lib/domain/normalize";
import { formatIssues, wineInputSchema, type WineInput, type WineInputRaw } from "@/lib/domain/validation";
import { isUuid } from "@/lib/domain/ids";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

export function parseWineInput(raw: unknown): WineInput {
  const parsed = wineInputSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(formatIssues(parsed.error));
  return parsed.data;
}

export async function upsertProducer(tx: Executor, userId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const normalizedName = normalizeProducer(name) || normalizeText(name);
  const existing = await tx.query.producer.findFirst({
    where: and(eq(producer.ownerId, userId), eq(producer.normalizedName, normalizedName)),
    columns: { id: true, name: true, aliases: true },
  });
  if (existing) {
    if (existing.name !== name && !existing.aliases.includes(name)) {
      await tx.update(producer).set({ aliases: [...existing.aliases, name], updatedAt: new Date() }).where(eq(producer.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await tx
    .insert(producer)
    .values({ ownerId: userId, name, normalizedName })
    .onConflictDoUpdate({ target: [producer.ownerId, producer.normalizedName], set: { updatedAt: new Date() } })
    .returning({ id: producer.id });
  return row.id;
}

async function upsertRegionRow(tx: Executor, userId: string, country: string, name: string, parentId: string | null, level: "region" | "subregion") {
  const normalizedName = normalizeText(name);
  const existing = await tx.query.region.findFirst({
    where: and(
      eq(region.ownerId, userId),
      eq(region.country, country),
      eq(region.normalizedName, normalizedName),
      parentId ? eq(region.parentId, parentId) : sql`${region.parentId} IS NULL`,
    ),
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [row] = await tx.insert(region).values({ ownerId: userId, country, name, normalizedName, parentId, level }).returning({ id: region.id });
  return row.id;
}

/** Returns the most specific region id for a country / region / sub-region triple. */
export async function upsertRegion(tx: Executor, userId: string, country: string | null, regionName: string | null, subregionName: string | null) {
  if (!country || !regionName) return null;
  const parent = await upsertRegionRow(tx, userId, country, regionName, null, "region");
  if (!subregionName) return parent;
  return upsertRegionRow(tx, userId, country, subregionName, parent, "subregion");
}

const PROVENANCE_KEYS = ["name", "producer", "vintage", "wineType", "country", "region", "subregion", "appellation", "alcoholPct", "grapes"] as const;

/** Provider-sourced values are only accepted alongside an explicit user confirmation timestamp. */
function sanitizeProvenance(input: WineInput): Record<string, FieldProvenance> {
  const out: Record<string, FieldProvenance> = {};
  for (const key of PROVENANCE_KEYS) {
    const p = input.provenance[key];
    if (!p || p.source === "user") {
      out[key] = { source: "user" };
      continue;
    }
    out[key] = {
      source: p.source,
      provider: p.provider,
      confidence: p.confidence,
      confirmedAt: p.confirmedAt ?? new Date().toISOString(),
    };
  }
  return out;
}

async function writeGrapes(tx: Executor, wineId: string, grapes: WineInput["grapes"], provenance: FieldProvenance | undefined) {
  await tx.delete(wineGrape).where(eq(wineGrape.wineId, wineId));
  if (!grapes.length) return;
  await tx.insert(wineGrape).values(
    grapes.map((g, i) => ({
      wineId,
      grape: g.name,
      normalizedGrape: normalizeText(g.name),
      percentage: g.percentage === null ? null : String(g.percentage),
      position: i,
      source: provenance?.source ?? "user",
    })),
  );
}

export async function createWineTx(tx: Tx, userId: string, input: WineInput, imageIds: string[] = []) {
  const producerId = await upsertProducer(tx, userId, input.producer);
  const regionId = await upsertRegion(tx, userId, input.country, input.region, input.subregion);
  const provenance = sanitizeProvenance(input);
  const [row] = await tx
    .insert(wine)
    .values({
      ownerId: userId,
      producerId,
      name: input.name,
      vintage: input.vintage,
      isNonVintage: input.isNonVintage,
      wineType: input.wineType as typeof wine.$inferInsert.wineType,
      country: input.country,
      regionId,
      appellation: input.appellation,
      alcoholPct: input.alcoholPct === null ? null : String(input.alcoholPct),
      fieldProvenance: provenance,
      identityKey: wineIdentityKey(input),
    })
    .returning();
  await writeGrapes(tx, row.id, input.grapes, provenance.grapes);
  await attachPendingImages(tx, userId, row.id, imageIds);
  return row;
}

export async function createWine(userId: string, raw: WineInputRaw | unknown, imageIds: string[] = []) {
  const input = parseWineInput(raw);
  return getDb().transaction((tx) => createWineTx(tx, userId, input, imageIds));
}

async function requireOwnedWine(tx: Executor, userId: string, wineId: string) {
  if (!isUuid(wineId)) throw new NotFoundError("Wine");
  const row = await tx.query.wine.findFirst({ where: and(eq(wine.id, wineId), eq(wine.ownerId, userId)) });
  if (!row) throw new NotFoundError("Wine");
  return row;
}

export { isUuid };

/**
 * Updates a wine's identity. Any field the user changes becomes user-sourced;
 * untouched fields keep their original provenance.
 */
export async function updateWine(userId: string, wineId: string, raw: unknown) {
  const input = parseWineInput(raw);
  return getDb().transaction(async (tx) => {
    const current = await getWineDetailTx(tx, userId, wineId);
    const producerId = await upsertProducer(tx, userId, input.producer);
    const regionId = await upsertRegion(tx, userId, input.country, input.region, input.subregion);
    const before: Record<string, unknown> = {
      name: current.name,
      producer: current.producer?.name ?? null,
      vintage: current.isNonVintage ? "NV" : current.vintage,
      wineType: current.wineType,
      country: current.country,
      region: current.regionPath.region,
      subregion: current.regionPath.subregion,
      appellation: current.appellation,
      alcoholPct: current.alcoholPct === null ? null : Number(current.alcoholPct),
      // Shares come back from numeric columns as text ("60.00"); compare them as numbers.
      grapes: current.grapes.map((g) => `${g.grape}:${g.percentage === null ? "" : Number(g.percentage)}`).join(","),
    };
    const after: Record<string, unknown> = {
      ...input,
      vintage: input.isNonVintage ? "NV" : input.vintage,
      grapes: input.grapes.map((g) => `${g.name}:${g.percentage ?? ""}`).join(","),
    };
    const provenance: Record<string, FieldProvenance> = { ...current.fieldProvenance };
    for (const key of PROVENANCE_KEYS) {
      if (String(before[key] ?? "") !== String(after[key] ?? "")) provenance[key] = { source: "user" };
      else provenance[key] ??= { source: "user" };
    }
    const [row] = await tx
      .update(wine)
      .set({
        producerId,
        name: input.name,
        vintage: input.vintage,
        isNonVintage: input.isNonVintage,
        wineType: input.wineType as typeof wine.$inferInsert.wineType,
        country: input.country,
        regionId,
        appellation: input.appellation,
        alcoholPct: input.alcoholPct === null ? null : String(input.alcoholPct),
        fieldProvenance: provenance,
        identityKey: wineIdentityKey(input),
        updatedAt: new Date(),
      })
      .where(and(eq(wine.id, wineId), eq(wine.ownerId, userId)))
      .returning();
    if (before.grapes !== after.grapes) await writeGrapes(tx, wineId, input.grapes, { source: "user" });
    return row;
  });
}

async function getWineDetailTx(tx: Executor, userId: string, wineId: string) {
  const row = await requireOwnedWine(tx, userId, wineId);
  const [prod, grapes, images, regionRow, sources] = await Promise.all([
    row.producerId ? tx.query.producer.findFirst({ where: and(eq(producer.id, row.producerId), eq(producer.ownerId, userId)) }) : null,
    tx.query.wineGrape.findMany({ where: eq(wineGrape.wineId, wineId), orderBy: asc(wineGrape.position) }),
    tx.query.wineImage.findMany({ where: and(eq(wineImage.wineId, wineId), eq(wineImage.ownerId, userId)), orderBy: asc(wineImage.createdAt) }),
    row.regionId ? tx.query.region.findFirst({ where: and(eq(region.id, row.regionId), eq(region.ownerId, userId)) }) : null,
    tx.query.metadataSourceRecord.findMany({
      where: and(eq(metadataSourceRecord.wineId, wineId), eq(metadataSourceRecord.ownerId, userId)),
      orderBy: desc(metadataSourceRecord.createdAt),
    }),
  ]);
  let regionPath: { region: string | null; subregion: string | null } = { region: null, subregion: null };
  if (regionRow) {
    if (regionRow.parentId) {
      const parent = await tx.query.region.findFirst({ where: and(eq(region.id, regionRow.parentId), eq(region.ownerId, userId)) });
      regionPath = { region: parent?.name ?? null, subregion: regionRow.name };
    } else {
      regionPath = { region: regionRow.name, subregion: null };
    }
  }
  return { ...row, producer: prod ?? null, grapes, images, regionPath, sources };
}

export async function getWineDetail(userId: string, wineId: string) {
  return getWineDetailTx(getDb(), userId, wineId);
}

export type WineDetail = Awaited<ReturnType<typeof getWineDetail>>;

/** Wine identity as an editable form value. */
export function wineToInput(w: WineDetail): WineInputRaw {
  return {
    name: w.name,
    producer: w.producer?.name ?? null,
    vintage: w.vintage,
    isNonVintage: w.isNonVintage,
    wineType: w.wineType,
    country: w.country,
    region: w.regionPath.region,
    subregion: w.regionPath.subregion,
    appellation: w.appellation,
    alcoholPct: w.alcoholPct === null ? null : Number(w.alcoholPct),
    grapes: w.grapes.map((g) => ({ name: g.grape, percentage: g.percentage === null ? null : Number(g.percentage) })),
    provenance: {},
  };
}

export type DuplicateCandidate = {
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  isNonVintage: boolean;
  wineType: string;
  tastings: number;
  thumbImageId: string | null;
  match: "same_wine" | "other_vintage";
};

/**
 * Finds the user's existing wines that probably refer to the same bottle
 * (same producer, name and vintage) or the same wine in another vintage.
 */
export async function findWineMatches(
  userId: string,
  probe: { producer?: string | null; name: string; vintage?: number | null; isNonVintage?: boolean | null },
  excludeWineId?: string,
): Promise<DuplicateCandidate[]> {
  if (!probe.name?.trim()) return [];
  const db = getDb();
  const key = wineIdentityKey(probe);
  const stem = key.split("|").slice(0, 2).join("|") + "|";
  const rows = await db
    .select({
      id: wine.id,
      name: wine.name,
      producer: producer.name,
      vintage: wine.vintage,
      isNonVintage: wine.isNonVintage,
      wineType: wine.wineType,
      identityKey: wine.identityKey,
      tastings: sql<number>`(select count(*)::int from ${tasting} t where t.wine_id = ${wine.id})`,
      thumbImageId: sql<string | null>`(select wi.id from ${wineImage} wi where wi.wine_id = ${wine.id} order by (wi.image_type = 'front_label') desc, wi.created_at asc limit 1)`,
    })
    .from(wine)
    .leftJoin(producer, eq(producer.id, wine.producerId))
    .where(
      and(
        eq(wine.ownerId, userId),
        sql`${wine.identityKey} LIKE ${escapeLike(stem) + "%"}`,
        excludeWineId && isUuid(excludeWineId) ? ne(wine.id, excludeWineId) : undefined,
      ),
    )
    .limit(20);
  return rows
    .map((r) => ({ ...r, match: (r.identityKey === key ? "same_wine" : "other_vintage") as DuplicateCandidate["match"] }))
    .sort((a, b) => (a.match === b.match ? (b.vintage ?? 0) - (a.vintage ?? 0) : a.match === "same_wine" ? -1 : 1))
    .map((r) => ({ id: r.id, name: r.name, producer: r.producer, vintage: r.vintage, isNonVintage: r.isNonVintage, wineType: r.wineType, tastings: r.tastings, thumbImageId: r.thumbImageId, match: r.match }));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Merges `sourceId` into `targetId`: every tasting, image and provenance record
 * moves to the target, then the now-empty source wine is removed. Tastings are
 * moved intact — no score or note is overwritten.
 */
export async function mergeWines(userId: string, targetId: string, sourceId: string) {
  if (targetId === sourceId) throw new UserFacingError("Choose two different wines to merge.");
  return getDb().transaction(async (tx) => {
    await requireOwnedWine(tx, userId, targetId);
    await requireOwnedWine(tx, userId, sourceId);
    const moved = await tx.update(tasting).set({ wineId: targetId, updatedAt: new Date() }).where(and(eq(tasting.wineId, sourceId), eq(tasting.ownerId, userId))).returning({ id: tasting.id });
    await tx.update(wineImage).set({ wineId: targetId }).where(and(eq(wineImage.wineId, sourceId), eq(wineImage.ownerId, userId)));
    await tx.update(metadataSourceRecord).set({ wineId: targetId }).where(and(eq(metadataSourceRecord.wineId, sourceId), eq(metadataSourceRecord.ownerId, userId)));
    await tx.delete(wine).where(and(eq(wine.id, sourceId), eq(wine.ownerId, userId)));
    await tx.update(wine).set({ updatedAt: new Date() }).where(eq(wine.id, targetId));
    return { movedTastings: moved.length };
  });
}

/** Deletes a wine with all its tastings, observations, tags and images (rows and stored files). */
export async function deleteWine(userId: string, wineId: string) {
  const db = getDb();
  const images = await db.transaction(async (tx) => {
    await requireOwnedWine(tx, userId, wineId);
    const imgs = await tx.query.wineImage.findMany({ where: and(eq(wineImage.wineId, wineId), eq(wineImage.ownerId, userId)) });
    await tx.delete(wine).where(and(eq(wine.id, wineId), eq(wine.ownerId, userId)));
    return imgs;
  });
  await safeDeleteObjects(storageKeysOf(images));
  return { deletedImages: images.length };
}

/** Other wines by the same producer, for the "related records" section. */
export async function relatedWines(userId: string, wineId: string, producerId: string | null) {
  if (!producerId) return [];
  const db = getDb();
  return db
    .select({
      id: wine.id,
      name: wine.name,
      vintage: wine.vintage,
      isNonVintage: wine.isNonVintage,
      wineType: wine.wineType,
      tastings: sql<number>`(select count(*)::int from ${tasting} t where t.wine_id = ${wine.id})`,
      bestScore: sql<string | null>`(select max(t.personal_score) from ${tasting} t where t.wine_id = ${wine.id})`,
    })
    .from(wine)
    .where(and(eq(wine.ownerId, userId), eq(wine.producerId, producerId), ne(wine.id, wineId)))
    .orderBy(desc(wine.vintage))
    .limit(12);
}

export async function recordMetadataSource(
  tx: Executor,
  userId: string,
  data: { wineId: string | null; imageId: string | null; provider: string; extractedText: string | null; candidate: unknown; confidence: number | null },
) {
  if (data.imageId) {
    const img = await tx.query.wineImage.findFirst({ where: and(eq(wineImage.id, data.imageId), eq(wineImage.ownerId, userId)), columns: { id: true } });
    if (!img) data.imageId = null;
  }
  await tx.insert(metadataSourceRecord).values({ ownerId: userId, ...data });
}

export async function listWineIdsByIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  return getDb().select({ id: wine.id }).from(wine).where(and(eq(wine.ownerId, userId), inArray(wine.id, ids.filter(isUuid))));
}
