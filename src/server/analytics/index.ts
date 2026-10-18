import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/server/db";
import { producer, region, sensoryObservation, tasting, wine, wineImage } from "@/server/db/schema";
import type { AnalyticsTasting } from "@/lib/domain/analytics";

const parentRegion = alias(region, "parent_region");

/** Loads every tasting for the user in the shape the pure analytics functions expect. */
export async function loadAnalyticsRows(userId: string): Promise<AnalyticsTasting[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tasting.id,
      wineId: wine.id,
      wineName: wine.name,
      producer: producer.name,
      vintage: wine.vintage,
      wineType: wine.wineType,
      country: wine.country,
      region: sql<string | null>`coalesce(${parentRegion.name}, ${region.name})`,
      tastedOn: tasting.tastedOn,
      score: tasting.personalScore,
      price: tasting.purchasePrice,
      currency: tasting.currency,
      priceBasis: tasting.priceBasis,
    })
    .from(tasting)
    .innerJoin(wine, and(eq(wine.id, tasting.wineId), eq(wine.ownerId, userId)))
    .leftJoin(producer, eq(producer.id, wine.producerId))
    .leftJoin(region, eq(region.id, wine.regionId))
    .leftJoin(parentRegion, eq(parentRegion.id, region.parentId))
    .where(eq(tasting.ownerId, userId));
  if (!rows.length) return [];
  const observations = await db
    .select({
      tastingId: sensoryObservation.tastingId,
      dimension: sensoryObservation.dimension,
      status: sensoryObservation.status,
      value: sensoryObservation.value,
      descriptor: sensoryObservation.descriptor,
    })
    .from(sensoryObservation)
    .where(inArray(sensoryObservation.tastingId, rows.map((r) => r.id)));
  const byTasting = new Map<string, AnalyticsTasting["observations"]>();
  for (const o of observations) {
    const list = byTasting.get(o.tastingId) ?? [];
    list.push({ dimension: o.dimension, status: o.status, value: o.value, descriptor: o.descriptor });
    byTasting.set(o.tastingId, list);
  }
  return rows.map((r) => ({
    ...r,
    score: r.score === null ? null : Number(r.score),
    price: r.price === null ? null : Number(r.price),
    observations: byTasting.get(r.id) ?? [],
  }));
}

/** Headline figures for the Atlas. All counts come straight from stored records. */
export async function overviewStats(userId: string) {
  const db = getDb();
  const [counts] = await db
    .select({
      wines: sql<number>`(SELECT count(*)::int FROM ${wine} WHERE ${wine.ownerId} = ${userId})`,
      tastings: sql<number>`(SELECT count(*)::int FROM ${tasting} WHERE ${tasting.ownerId} = ${userId})`,
      rated: sql<number>`(SELECT count(*)::int FROM ${tasting} WHERE ${tasting.ownerId} = ${userId} AND ${tasting.personalScore} IS NOT NULL)`,
      meanScore: sql<string | null>`(SELECT avg(${tasting.personalScore}) FROM ${tasting} WHERE ${tasting.ownerId} = ${userId})`,
      countries: sql<number>`(SELECT count(DISTINCT ${wine.country})::int FROM ${wine} WHERE ${wine.ownerId} = ${userId})`,
      regions: sql<number>`(SELECT count(DISTINCT coalesce(r.parent_id, r.id))::int FROM ${wine} w JOIN ${region} r ON r.id = w.region_id WHERE w.owner_id = ${userId})`,
    })
    .from(sql`(SELECT 1) AS one`);
  return {
    wines: counts.wines,
    tastings: counts.tastings,
    rated: counts.rated,
    meanScore: counts.meanScore === null ? null : Number(counts.meanScore),
    countries: counts.countries,
    regions: counts.regions,
  };
}

/** Recent tastings with a bottle image where one exists. */
export async function recentTastings(userId: string, limit = 6) {
  const db = getDb();
  return db
    .select({
      id: tasting.id,
      wineId: wine.id,
      tastedOn: tasting.tastedOn,
      score: tasting.personalScore,
      impression: tasting.impression,
      wineName: wine.name,
      vintage: wine.vintage,
      isNonVintage: wine.isNonVintage,
      wineType: wine.wineType,
      producer: producer.name,
      country: wine.country,
      imageId: sql<string | null>`(SELECT wi.id FROM ${wineImage} wi WHERE wi.wine_id = ${wine.id} ORDER BY (wi.image_type = 'front_label') DESC, wi.created_at ASC LIMIT 1)`,
    })
    .from(tasting)
    .innerJoin(wine, and(eq(wine.id, tasting.wineId), eq(wine.ownerId, userId)))
    .leftJoin(producer, eq(producer.id, wine.producerId))
    .where(eq(tasting.ownerId, userId))
    .orderBy(sql`${tasting.tastedOn} DESC`, sql`${tasting.createdAt} DESC`)
    .limit(limit);
}

/** Highest-rated tastings, newest first among ties. */
export async function favouriteTastings(userId: string, limit = 4) {
  const db = getDb();
  return db
    .select({
      id: tasting.id,
      wineId: wine.id,
      tastedOn: tasting.tastedOn,
      score: tasting.personalScore,
      wineName: wine.name,
      vintage: wine.vintage,
      isNonVintage: wine.isNonVintage,
      wineType: wine.wineType,
      producer: producer.name,
      imageId: sql<string | null>`(SELECT wi.id FROM ${wineImage} wi WHERE wi.wine_id = ${wine.id} ORDER BY (wi.image_type = 'front_label') DESC, wi.created_at ASC LIMIT 1)`,
    })
    .from(tasting)
    .innerJoin(wine, and(eq(wine.id, tasting.wineId), eq(wine.ownerId, userId)))
    .leftJoin(producer, eq(producer.id, wine.producerId))
    .where(and(eq(tasting.ownerId, userId), sql`${tasting.personalScore} >= 8`))
    .orderBy(sql`${tasting.personalScore} DESC`, sql`${tasting.tastedOn} DESC`)
    .limit(limit);
}

/** Region index: countries → regions → sub-regions/appellations, with the user's figures. */
export async function regionIndex(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      wineId: wine.id,
      country: wine.country,
      appellation: wine.appellation,
      regionId: region.id,
      regionName: region.name,
      regionLat: region.latitude,
      regionLng: region.longitude,
      parentId: parentRegion.id,
      parentName: parentRegion.name,
      tastings: sql<number>`(SELECT count(*)::int FROM ${tasting} t WHERE t.wine_id = ${wine.id})`,
      scoreSum: sql<string | null>`(SELECT sum(t.personal_score) FROM ${tasting} t WHERE t.wine_id = ${wine.id})`,
      rated: sql<number>`(SELECT count(t.personal_score)::int FROM ${tasting} t WHERE t.wine_id = ${wine.id})`,
    })
    .from(wine)
    .leftJoin(region, eq(region.id, wine.regionId))
    .leftJoin(parentRegion, eq(parentRegion.id, region.parentId))
    .where(eq(wine.ownerId, userId));
  return rows.map((r) => ({ ...r, scoreSum: r.scoreSum === null ? 0 : Number(r.scoreSum) }));
}
