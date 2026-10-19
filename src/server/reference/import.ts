/**
 * Idempotent catalog import. One transaction per source: everything lands or
 * nothing does. Records are matched by (source, external id), so re-running the
 * same snapshot changes nothing. Records missing from a new snapshot are
 * reported as stale, never deleted automatically.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getDb, type Database } from "@/server/db";
import { catalogAlias, catalogGrape, catalogProducer, catalogProduct, catalogRegion, catalogSource, catalogWine, catalogWineGrape } from "@/server/db/schema";
import { normalizeProducer, normalizeText } from "@/lib/domain/normalize";
import { validateBatch, type ImportBatch, type Rejection } from "@/lib/domain/catalog";
import type { CatalogSourceMeta } from "./sources";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type KindReport = { inserted: number; updated: number; unchanged: number; stale: number };
export type ImportReport = {
  source: string;
  dryRun: boolean;
  regions: KindReport;
  producers: KindReport;
  grapes: KindReport;
  wines: KindReport;
  products: KindReport;
  aliases: { added: number; removed: number };
  rejected: Rejection[];
  duplicates: number;
};

class DryRunRollback extends Error {}
const CHUNK = 500;
const chunks = <T,>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK));
const omit = <T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> => {
  const copy = { ...row };
  delete copy[key];
  return copy;
};
const emptyKind = (): KindReport => ({ inserted: 0, updated: 0, unchanged: 0, stale: 0 });

/**
 * Splits desired rows into new / changed / unchanged against what the source
 * already holds, comparing only the listed fields.
 */
function diff<R extends { externalId: string }>(desired: R[], existing: Map<string, Record<string, unknown>>, fields: (keyof R & string)[], report: KindReport) {
  const write: R[] = [];
  for (const row of desired) {
    const old = existing.get(row.externalId);
    if (!old) {
      report.inserted++;
      write.push(row);
    } else if (fields.some((f) => String(old[f] ?? "") !== String(row[f] ?? ""))) {
      report.updated++;
      write.push(row);
    } else report.unchanged++;
  }
  const desiredIds = new Set(desired.map((d) => d.externalId));
  report.stale += [...existing.keys()].filter((id) => !desiredIds.has(id)).length;
  return write;
}

async function upsert<R extends Record<string, unknown>>(tx: Tx, table: PgTable & { sourceId: unknown; externalId: unknown }, rows: R[], updateCols: string[]) {
  for (const part of chunks(rows)) {
    const set = Object.fromEntries(updateCols.map((c) => [c, sql.raw(`excluded.${c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`)]));
    await tx
      .insert(table)
      .values(part as never)
      .onConflictDoUpdate({ target: [table.sourceId, table.externalId] as never, set: set as never });
  }
}

async function idMap(tx: Tx, table: typeof catalogRegion | typeof catalogProducer | typeof catalogGrape | typeof catalogWine, sourceId: string) {
  const rows = await tx.select({ id: table.id, externalId: table.externalId }).from(table).where(eq(table.sourceId, sourceId));
  return new Map(rows.map((r) => [r.externalId, r.id]));
}

export async function importCatalogBatch(source: CatalogSourceMeta, input: ImportBatch, options: { dryRun: boolean; retrievedAt: Date }): Promise<ImportReport> {
  const { batch, rejected, duplicates } = validateBatch(input);
  const report: ImportReport = {
    source: source.id,
    dryRun: options.dryRun,
    regions: emptyKind(),
    producers: emptyKind(),
    grapes: emptyKind(),
    wines: emptyKind(),
    products: emptyKind(),
    aliases: { added: 0, removed: 0 },
    rejected,
    duplicates: duplicates.length,
  };
  const at = options.retrievedAt;
  try {
    await getDb().transaction(async (tx) => {
      await tx
        .insert(catalogSource)
        .values({ id: source.id, name: source.name, url: source.url, license: source.license, attribution: source.attribution, approvedForLookup: source.approvedForLookup, retrievedAt: at })
        .onConflictDoUpdate({
          target: catalogSource.id,
          set: { name: source.name, url: source.url, license: source.license, attribution: source.attribution, approvedForLookup: source.approvedForLookup, retrievedAt: at },
        });

      // Regions (parents linked in a second pass, once every id exists).
      const regionRows = batch.regions.map((r) => ({ externalId: r.externalId, sourceId: source.id, kind: r.kind, name: r.name, normalizedName: normalizeText(r.name), country: r.country, confidence: source.confidence, lastVerifiedAt: at, parentExternal: r.parentExternalId }));
      const existingRegions = new Map(
        (await tx.select().from(catalogRegion).where(eq(catalogRegion.sourceId, source.id))).map((r) => [r.externalId, { ...r, parentExternal: null as string | null }]),
      );
      const regionIdByExternal0 = new Map([...existingRegions.values()].map((r) => [r.id, r.externalId]));
      for (const r of existingRegions.values()) r.parentExternal = r.parentId ? (regionIdByExternal0.get(r.parentId) ?? null) : null;
      const regionWrites = diff(regionRows, existingRegions, ["kind", "name", "country", "confidence", "parentExternal"], report.regions);
      await upsert(tx, catalogRegion, regionWrites.map((r) => omit(r, "parentExternal")), ["kind", "name", "normalizedName", "country", "confidence", "lastVerifiedAt"]);
      const regionIds = await idMap(tx, catalogRegion, source.id);
      for (const r of regionWrites) {
        await tx
          .update(catalogRegion)
          .set({ parentId: r.parentExternal ? (regionIds.get(r.parentExternal) ?? null) : null })
          .where(and(eq(catalogRegion.sourceId, source.id), eq(catalogRegion.externalId, r.externalId)));
      }

      const producerRows = batch.producers.map((p) => ({ externalId: p.externalId, sourceId: source.id, name: p.name, normalizedName: normalizeProducer(p.name), country: p.country, regionId: p.regionExternalId ? (regionIds.get(p.regionExternalId) ?? null) : null, confidence: source.confidence, lastVerifiedAt: at }));
      const existingProducers = new Map((await tx.select().from(catalogProducer).where(eq(catalogProducer.sourceId, source.id))).map((r) => [r.externalId, r as Record<string, unknown>]));
      await upsert(tx, catalogProducer, diff(producerRows, existingProducers, ["name", "country", "regionId", "confidence"], report.producers), ["name", "normalizedName", "country", "regionId", "confidence", "lastVerifiedAt"]);
      const producerIds = await idMap(tx, catalogProducer, source.id);

      const grapeRows = batch.grapes.map((g) => ({ externalId: g.externalId, sourceId: source.id, name: g.name, normalizedName: normalizeText(g.name), lastVerifiedAt: at }));
      const existingGrapes = new Map((await tx.select().from(catalogGrape).where(eq(catalogGrape.sourceId, source.id))).map((r) => [r.externalId, r as Record<string, unknown>]));
      await upsert(tx, catalogGrape, diff(grapeRows, existingGrapes, ["name"], report.grapes), ["name", "normalizedName", "lastVerifiedAt"]);
      const grapeIds = await idMap(tx, catalogGrape, source.id);

      const wineRows = batch.wines.map((w) => ({
        externalId: w.externalId,
        sourceId: source.id,
        name: w.name,
        normalizedName: normalizeText(w.name),
        producerId: w.producerExternalId ? (producerIds.get(w.producerExternalId) ?? null) : null,
        regionId: w.regionExternalId ? (regionIds.get(w.regionExternalId) ?? null) : null,
        wineType: w.wineType as typeof catalogWine.$inferInsert.wineType,
        country: w.country,
        confidence: source.confidence,
        lastVerifiedAt: at,
        grapeKey: w.grapeExternalIds.slice().sort().join(","),
      }));
      const existingWines = await tx.select().from(catalogWine).where(eq(catalogWine.sourceId, source.id));
      const existingWineGrapes = existingWines.length
        ? await tx.select({ wineId: catalogWineGrape.wineId, grapeId: catalogWineGrape.grapeId }).from(catalogWineGrape).where(inArray(catalogWineGrape.wineId, existingWines.map((w) => w.id)))
        : [];
      const grapeExternalById = new Map([...grapeIds.entries()].map(([ext, id]) => [id, ext]));
      const wineMap = new Map(
        existingWines.map((w) => [
          w.externalId,
          { ...w, grapeKey: existingWineGrapes.filter((g) => g.wineId === w.id).map((g) => grapeExternalById.get(g.grapeId)).sort().join(",") } as Record<string, unknown>,
        ]),
      );
      const wineWrites = diff(wineRows, wineMap, ["name", "producerId", "regionId", "wineType", "country", "confidence", "grapeKey"], report.wines);
      await upsert(tx, catalogWine, wineWrites.map((w) => omit(w, "grapeKey")), ["name", "normalizedName", "producerId", "regionId", "wineType", "country", "confidence", "lastVerifiedAt"]);
      const wineIds = await idMap(tx, catalogWine, source.id);
      const sourceWine = new Map(batch.wines.map((w) => [w.externalId, w]));
      for (const w of wineWrites) {
        const id = wineIds.get(w.externalId)!;
        await tx.delete(catalogWineGrape).where(eq(catalogWineGrape.wineId, id));
        const grapes = sourceWine.get(w.externalId)!.grapeExternalIds.map((g) => grapeIds.get(g)).filter((g): g is string => Boolean(g));
        if (grapes.length) await tx.insert(catalogWineGrape).values(grapes.map((grapeId) => ({ wineId: id, grapeId })));
      }

      const productRows = batch.products.map((p) => ({
        externalId: p.externalId,
        sourceId: source.id,
        barcode: p.barcode,
        productName: p.productName,
        normalizedName: normalizeText(p.productName),
        producerName: p.producerName,
        wineId: p.wineExternalId ? (wineIds.get(p.wineExternalId) ?? null) : null,
        vintage: p.vintage,
        isNonVintage: p.isNonVintage,
        volumeMl: p.volumeMl,
        alcoholPct: p.alcoholPct === null ? null : String(p.alcoholPct),
        country: p.country,
        lastVerifiedAt: at,
      }));
      const existingProducts = new Map(
        (await tx.select().from(catalogProduct).where(eq(catalogProduct.sourceId, source.id))).map((r) => [r.externalId, { ...r, alcoholPct: r.alcoholPct === null ? null : String(Number(r.alcoholPct)) } as Record<string, unknown>]),
      );
      await upsert(
        tx,
        catalogProduct,
        diff(productRows, existingProducts, ["barcode", "productName", "producerName", "wineId", "vintage", "isNonVintage", "volumeMl", "alcoholPct", "country"], report.products),
        ["barcode", "productName", "normalizedName", "producerName", "wineId", "vintage", "isNonVintage", "volumeMl", "alcoholPct", "country", "lastVerifiedAt"],
      );

      // Aliases: make this source's aliases match the snapshot exactly.
      const desiredAliases: { entity: "producer" | "region" | "grape" | "wine"; entityId: string; alias: string; normalizedAlias: string; sourceId: string }[] = [];
      const addAliases = (entity: "producer" | "region" | "grape" | "wine", ids: Map<string, string>, recs: { externalId: string; aliases: string[] }[], normalize: (s: string) => string) => {
        for (const r of recs) {
          const entityId = ids.get(r.externalId);
          if (!entityId) continue;
          const seen = new Set<string>();
          for (const alias of r.aliases) {
            const n = normalize(alias);
            if (!n || seen.has(n)) continue;
            seen.add(n);
            desiredAliases.push({ entity, entityId, alias, normalizedAlias: n, sourceId: source.id });
          }
        }
      };
      addAliases("region", regionIds, batch.regions, normalizeText);
      addAliases("producer", producerIds, batch.producers, normalizeProducer);
      addAliases("grape", grapeIds, batch.grapes, normalizeText);
      addAliases("wine", wineIds, batch.wines, normalizeText);
      const existingAliases = await tx.select().from(catalogAlias).where(eq(catalogAlias.sourceId, source.id));
      const key = (a: { entity: string; entityId: string; normalizedAlias: string }) => `${a.entity}|${a.entityId}|${a.normalizedAlias}`;
      const existingKeys = new Set(existingAliases.map(key));
      const desiredKeys = new Set(desiredAliases.map(key));
      const toAdd = desiredAliases.filter((a) => !existingKeys.has(key(a)));
      const toRemove = existingAliases.filter((a) => !desiredKeys.has(key(a)));
      for (const part of chunks(toAdd)) await tx.insert(catalogAlias).values(part).onConflictDoNothing();
      for (const part of chunks(toRemove)) await tx.delete(catalogAlias).where(inArray(catalogAlias.id, part.map((a) => a.id)));
      report.aliases = { added: toAdd.length, removed: toRemove.length };

      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }
  return report;
}
