import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/server/db";
import { producer, region, sensoryObservation, tasting, tastingTag, wine, wineGrape, wineImage } from "@/server/db/schema";
import { normalizeText } from "@/lib/domain/normalize";
import { isWineType } from "@/lib/domain/wine";

export type JournalSort = "date_desc" | "date_asc" | "score_desc" | "score_asc" | "name_asc" | "price_desc" | "price_asc";

export const JOURNAL_SORTS: { value: JournalSort; label: string }[] = [
  { value: "date_desc", label: "Newest tasting" },
  { value: "date_asc", label: "Oldest tasting" },
  { value: "score_desc", label: "Highest rated" },
  { value: "score_asc", label: "Lowest rated" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "price_asc", label: "Price, low to high" },
];

export type JournalQuery = {
  q?: string;
  type?: string;
  country?: string;
  region?: string;
  grape?: string;
  scoreMin?: number;
  scoreMax?: number;
  from?: string;
  to?: string;
  sort?: JournalSort;
  ids?: string[];
};

const parentRegion = alias(region, "parent_region");

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Parses URL search params into a validated query; invalid values are ignored. */
export function parseJournalQuery(params: Record<string, string | string[] | undefined>): JournalQuery {
  const get = (k: string) => {
    const v = params[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const num = (k: string) => {
    const v = get(k);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : undefined;
  };
  const date = (k: string) => {
    const v = get(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };
  const sort = get("sort");
  const type = get("type");
  const country = get("country");
  const ids = get("ids");
  return {
    q: get("q")?.slice(0, 120),
    type: type && isWineType(type) ? type : undefined,
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    region: get("region")?.slice(0, 120),
    grape: get("grape")?.slice(0, 80),
    scoreMin: num("min"),
    scoreMax: num("max"),
    from: date("from"),
    to: date("to"),
    sort: JOURNAL_SORTS.some((s) => s.value === sort) ? (sort as JournalSort) : "date_desc",
    ids: ids
      ?.split(",")
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 200),
  };
}

function searchCondition(q: string): SQL | undefined {
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return undefined;
  const parts = terms.map((term) => {
    const like = `%${escapeLike(term)}%`;
    const normLike = `%${escapeLike(normalizeText(term))}%`;
    return sql`(
      ${wine.name} ILIKE ${like}
      OR ${producer.name} ILIKE ${like}
      OR ${wine.vintage}::text = ${term}
      OR ${wine.appellation} ILIKE ${like}
      OR ${region.name} ILIKE ${like}
      OR ${parentRegion.name} ILIKE ${like}
      OR ${tasting.notes} ILIKE ${like}
      OR ${tasting.impression} ILIKE ${like}
      OR ${tasting.venue} ILIKE ${like}
      OR ${tasting.occasion} ILIKE ${like}
      OR ${tasting.foodPairing} ILIKE ${like}
      OR EXISTS (SELECT 1 FROM ${wineGrape} g WHERE g.wine_id = ${wine.id} AND g.normalized_grape LIKE ${normLike})
      OR EXISTS (SELECT 1 FROM ${sensoryObservation} o WHERE o.tasting_id = ${tasting.id} AND o.descriptor ILIKE ${like})
      OR EXISTS (SELECT 1 FROM ${tastingTag} tg WHERE tg.tasting_id = ${tasting.id} AND tg.tag ILIKE ${like})
    )`;
  });
  return and(...parts);
}

function conditions(userId: string, query: JournalQuery): SQL[] {
  const c: (SQL | undefined)[] = [eq(tasting.ownerId, userId)];
  if (query.q) c.push(searchCondition(query.q));
  if (query.type) c.push(eq(wine.wineType, query.type as typeof wine.$inferSelect.wineType));
  if (query.country) c.push(eq(wine.country, query.country));
  if (query.region) {
    const name = normalizeText(query.region);
    c.push(sql`(${region.normalizedName} = ${name} OR ${parentRegion.normalizedName} = ${name})`);
  }
  if (query.grape) {
    c.push(sql`EXISTS (SELECT 1 FROM ${wineGrape} g WHERE g.wine_id = ${wine.id} AND g.normalized_grape = ${normalizeText(query.grape)})`);
  }
  if (query.scoreMin !== undefined) c.push(gte(tasting.personalScore, String(query.scoreMin)));
  if (query.scoreMax !== undefined) c.push(lte(tasting.personalScore, String(query.scoreMax)));
  if (query.from) c.push(gte(tasting.tastedOn, query.from));
  if (query.to) c.push(lte(tasting.tastedOn, query.to));
  if (query.ids?.length) c.push(sql`${tasting.id} IN (${sql.join(query.ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
  return c.filter((x): x is SQL => Boolean(x));
}

function orderBy(sort: JournalSort) {
  switch (sort) {
    case "date_asc":
      return [asc(tasting.tastedOn), asc(tasting.createdAt)];
    case "score_desc":
      return [sql`${tasting.personalScore} DESC NULLS LAST`, desc(tasting.tastedOn)];
    case "score_asc":
      return [sql`${tasting.personalScore} ASC NULLS LAST`, desc(tasting.tastedOn)];
    case "name_asc":
      return [sql`lower(coalesce(${producer.name}, '') || ' ' || ${wine.name})`, asc(wine.vintage), desc(tasting.tastedOn)];
    case "price_desc":
      return [asc(tasting.currency), sql`${tasting.purchasePrice} DESC NULLS LAST`, desc(tasting.tastedOn)];
    case "price_asc":
      return [asc(tasting.currency), sql`${tasting.purchasePrice} ASC NULLS LAST`, desc(tasting.tastedOn)];
    default:
      return [desc(tasting.tastedOn), desc(tasting.createdAt)];
  }
}

export type JournalEntry = Awaited<ReturnType<typeof searchJournal>>["entries"][number];

export async function searchJournal(userId: string, query: JournalQuery, limit = 200) {
  const db = getDb();
  const where = and(...conditions(userId, query));
  const entries = await db
    .select({
      id: tasting.id,
      wineId: wine.id,
      tastedOn: tasting.tastedOn,
      score: tasting.personalScore,
      price: tasting.purchasePrice,
      currency: tasting.currency,
      priceBasis: tasting.priceBasis,
      impression: tasting.impression,
      notes: tasting.notes,
      venue: tasting.venue,
      occasion: tasting.occasion,
      blindStatus: tasting.blindStatus,
      wineName: wine.name,
      vintage: wine.vintage,
      isNonVintage: wine.isNonVintage,
      wineType: wine.wineType,
      country: wine.country,
      appellation: wine.appellation,
      producer: producer.name,
      regionName: region.name,
      parentRegionName: parentRegion.name,
      imageId: sql<string | null>`(SELECT wi.id FROM ${wineImage} wi WHERE wi.wine_id = ${wine.id} ORDER BY (wi.image_type = 'front_label') DESC, wi.created_at ASC LIMIT 1)`,
      grapes: sql<string | null>`(SELECT string_agg(g.grape, ', ' ORDER BY g.position) FROM ${wineGrape} g WHERE g.wine_id = ${wine.id})`,
    })
    .from(tasting)
    .innerJoin(wine, and(eq(wine.id, tasting.wineId), eq(wine.ownerId, userId)))
    .leftJoin(producer, eq(producer.id, wine.producerId))
    .leftJoin(region, eq(region.id, wine.regionId))
    .leftJoin(parentRegion, eq(parentRegion.id, region.parentId))
    .where(where)
    .orderBy(...orderBy(query.sort ?? "date_desc"))
    .limit(limit + 1);

  return {
    entries: entries.slice(0, limit),
    truncated: entries.length > limit,
  };
}

/** Wines view: one row per canonical wine with aggregate tasting figures. */
export async function listWines(userId: string, query: JournalQuery, limit = 200) {
  const { entries, truncated } = await searchJournal(userId, { ...query, sort: query.sort ?? "date_desc" }, 2000);
  const byWine = new Map<string, { entry: JournalEntry; count: number; scores: number[]; last: string }>();
  for (const e of entries) {
    const w = byWine.get(e.wineId);
    const score = e.score === null ? null : Number(e.score);
    if (!w) byWine.set(e.wineId, { entry: e, count: 1, scores: score === null ? [] : [score], last: e.tastedOn });
    else {
      w.count++;
      if (score !== null) w.scores.push(score);
      if (e.tastedOn > w.last) w.last = e.tastedOn;
    }
  }
  return {
    wines: [...byWine.values()].slice(0, limit).map((w) => ({
      ...w.entry,
      tastingCount: w.count,
      lastTasted: w.last,
      meanScore: w.scores.length ? w.scores.reduce((a, b) => a + b, 0) / w.scores.length : null,
      ratedCount: w.scores.length,
    })),
    truncated,
  };
}

/** Values available to the journal filter sheet (only what the user has recorded). */
export async function journalFacets(userId: string) {
  const db = getDb();
  const [countries, regions, grapes] = await Promise.all([
    db.selectDistinct({ country: wine.country }).from(wine).where(and(eq(wine.ownerId, userId), sql`${wine.country} IS NOT NULL`)),
    db.selectDistinct({ name: region.name }).from(region).where(eq(region.ownerId, userId)).orderBy(asc(region.name)),
    db
      .selectDistinct({ grape: wineGrape.grape, normalized: wineGrape.normalizedGrape })
      .from(wineGrape)
      .innerJoin(wine, eq(wine.id, wineGrape.wineId))
      .where(eq(wine.ownerId, userId))
      .orderBy(asc(wineGrape.normalizedGrape)),
  ]);
  const uniqueGrapes = new Map<string, string>();
  for (const g of grapes) if (!uniqueGrapes.has(g.normalized)) uniqueGrapes.set(g.normalized, g.grape);
  return {
    countries: countries.map((c) => c.country!).sort(),
    regions: [...new Set(regions.map((r) => r.name))],
    grapes: [...uniqueGrapes.values()],
  };
}
