import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  metadataSourceRecord,
  producer,
  region,
  sensoryObservation,
  tasting,
  tastingTag,
  user,
  userPreferences,
  wine,
  wineGrape,
  wineImage,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { isUuid } from "@/server/catalog/wines";
import { countryName } from "@/lib/domain/countries";

export const EXPORT_FORMAT = "vino-nota-export";
export const EXPORT_VERSION = 1;

const num = (v: string | null) => (v === null ? null : Number(v));

/**
 * Complete, portable export of everything the user has recorded. Internal
 * storage keys are omitted; photos are referenced by id and can be downloaded
 * from /api/images/{id}?size=original while signed in.
 */
export async function buildAccountExport(userId: string, options: { wineIds?: string[] } = {}) {
  const db = getDb();
  const account = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { name: true, email: true, createdAt: true } });
  if (!account) throw new NotFoundError("Account");
  const prefs = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });

  let wines = await db.query.wine.findMany({ where: eq(wine.ownerId, userId), orderBy: asc(wine.createdAt) });
  if (options.wineIds) {
    const wanted = new Set(options.wineIds);
    wines = wines.filter((w) => wanted.has(w.id));
  }
  const wineIds = wines.map((w) => w.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const ids = wineIds.length ? wineIds : none;

  const [producers, regions, grapes, images, sources, tastings] = await Promise.all([
    db.query.producer.findMany({ where: eq(producer.ownerId, userId), orderBy: asc(producer.name) }),
    db.query.region.findMany({ where: eq(region.ownerId, userId), orderBy: asc(region.name) }),
    db.query.wineGrape.findMany({ where: inArray(wineGrape.wineId, ids), orderBy: asc(wineGrape.position) }),
    db.query.wineImage.findMany({ where: inArray(wineImage.wineId, ids), orderBy: asc(wineImage.createdAt) }),
    db.query.metadataSourceRecord.findMany({ where: inArray(metadataSourceRecord.wineId, ids), orderBy: asc(metadataSourceRecord.createdAt) }),
    db.query.tasting.findMany({ where: inArray(tasting.wineId, ids), orderBy: [asc(tasting.tastedOn), asc(tasting.createdAt)] }),
  ]);
  const tastingIds = tastings.length ? tastings.map((t) => t.id) : none;
  const [observations, tags] = await Promise.all([
    db.query.sensoryObservation.findMany({ where: inArray(sensoryObservation.tastingId, tastingIds) }),
    db.query.tastingTag.findMany({ where: inArray(tastingTag.tastingId, tastingIds) }),
  ]);

  const usedProducers = new Set(wines.map((w) => w.producerId));
  const usedRegions = new Set<string>();
  for (const w of wines) {
    let r = regions.find((x) => x.id === w.regionId);
    while (r) {
      usedRegions.add(r.id);
      r = r.parentId ? regions.find((x) => x.id === r!.parentId) : undefined;
    }
  }
  const scoped = Boolean(options.wineIds);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    notes: [
      "personalScore is your own 0.0–10.0 enjoyment rating; null means not rated.",
      "Prices are stored in their original currency and never converted.",
      "A dimension with no observation was not assessed. status distinguishes unknown, absent and not_applicable.",
      "fieldProvenance records whether each wine field was entered by you or suggested by a provider and confirmed by you.",
    ],
    account: scoped ? undefined : { name: account.name, email: account.email, createdAt: account.createdAt.toISOString() },
    preferences: scoped ? undefined : { defaultCurrency: prefs?.defaultCurrency ?? "USD" },
    producers: producers
      .filter((p) => !scoped || usedProducers.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, aliases: p.aliases, externalIds: p.externalIds })),
    regions: regions
      .filter((r) => !scoped || usedRegions.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        country: r.country,
        countryName: countryName(r.country),
        parentId: r.parentId,
        level: r.level,
        latitude: r.latitude,
        longitude: r.longitude,
        coordinateSource: r.coordinateSource,
        source: r.source,
      })),
    wines: wines.map((w) => ({
      id: w.id,
      name: w.name,
      producerId: w.producerId,
      vintage: w.vintage,
      isNonVintage: w.isNonVintage,
      wineType: w.wineType,
      country: w.country,
      regionId: w.regionId,
      appellation: w.appellation,
      alcoholPct: num(w.alcoholPct),
      externalIds: w.externalIds,
      fieldProvenance: w.fieldProvenance,
      grapes: grapes.filter((g) => g.wineId === w.id).map((g) => ({ grape: g.grape, percentage: num(g.percentage), source: g.source })),
      images: images
        .filter((i) => i.wineId === w.id)
        .map((i) => ({ id: i.id, imageType: i.imageType, width: i.width, height: i.height, source: i.source, attribution: i.attribution, createdAt: i.createdAt.toISOString() })),
      metadataSources: sources
        .filter((s) => s.wineId === w.id)
        .map((s) => ({ provider: s.provider, extractedText: s.extractedText, candidate: s.candidate, confidence: s.confidence, createdAt: s.createdAt.toISOString() })),
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
    tastings: tastings.map((t) => ({
      id: t.id,
      wineId: t.wineId,
      tastedOn: t.tastedOn,
      personalScore: num(t.personalScore),
      purchasePrice: num(t.purchasePrice),
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
      servingTempC: num(t.servingTempC),
      decantMinutes: t.decantMinutes,
      bottleProvenance: t.bottleProvenance,
      storageNotes: t.storageNotes,
      observations: observations
        .filter((o) => o.tastingId === t.id)
        .map((o) => ({ dimension: o.dimension, status: o.status, value: o.value, descriptor: o.descriptor, category: o.category, intensity: o.intensity, source: o.source, confidence: o.confidence })),
      tags: tags.filter((g) => g.tastingId === t.id).map((g) => g.tag),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  };
}

export type AccountExport = Awaited<ReturnType<typeof buildAccountExport>>;

export async function buildWineExport(userId: string, wineId: string) {
  if (!isUuid(wineId)) throw new NotFoundError("Wine");
  const data = await buildAccountExport(userId, { wineIds: [wineId] });
  if (!data.wines.length) throw new NotFoundError("Wine");
  return data;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per tasting, for spreadsheets. */
export function exportToCsv(data: AccountExport): string {
  const wines = new Map(data.wines.map((w) => [w.id, w]));
  const producers = new Map(data.producers.map((p) => [p.id, p.name]));
  const regions = new Map(data.regions.map((r) => [r.id, r]));
  const header = [
    "tasting_id", "tasted_on", "personal_score", "wine_id", "producer", "wine", "vintage", "wine_type", "grapes",
    "country", "region", "appellation", "purchase_price", "currency", "price_basis", "venue", "occasion", "food_pairing",
    "would_buy_again", "blind_status", "impression", "notes", "body", "acidity", "sweetness", "tannin", "finish", "descriptors", "tags",
  ];
  const lines = [header.join(",")];
  for (const t of data.tastings) {
    const w = wines.get(t.wineId);
    const r = w?.regionId ? regions.get(w.regionId) : undefined;
    const parent = r?.parentId ? regions.get(r.parentId) : undefined;
    const obs = (dim: string) => {
      const o = t.observations.find((x) => x.dimension === dim);
      if (!o) return "";
      return o.status === "assessed" ? o.value : o.status;
    };
    lines.push(
      [
        t.id, t.tastedOn, t.personalScore, t.wineId, w?.producerId ? producers.get(w.producerId) : "", w?.name, w?.vintage ?? (w?.isNonVintage ? "NV" : ""),
        w?.wineType, w?.grapes.map((g) => (g.percentage ? `${g.grape} ${g.percentage}%` : g.grape)).join("; "),
        w?.country, [parent?.name, r?.name].filter(Boolean).join(" › "), w?.appellation, t.purchasePrice, t.currency, t.priceBasis,
        t.venue, t.occasion, t.foodPairing, t.wouldBuyAgain, t.blindStatus, t.impression, t.notes,
        obs("body"), obs("acidity"), obs("sweetness"), obs("tannin"), obs("finish"),
        t.observations.filter((o) => (o.dimension === "aroma" || o.dimension === "flavor") && o.descriptor).map((o) => o.descriptor).join("; "),
        t.tags.join("; "),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
