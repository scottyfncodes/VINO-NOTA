import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db";
import { catalogAlias, catalogContribution, catalogProducer, catalogRegion, catalogSource, catalogWine } from "@/server/db/schema";
import { importCatalogBatch } from "@/server/reference/import";
import { CATALOG_SOURCES } from "@/server/reference/sources";
import { clearCatalogLookupCache, lookupCatalog, LOOKUP_TIMEOUT_MS } from "@/server/reference/lookup";
import { recognizeLabel, setRecognitionProviderForTesting, type LabelRecognitionProvider, type RecognitionCandidate } from "@/server/recognition";
import { uploadImage } from "@/server/images";
import { saveCapture } from "@/server/tastings";
import { buildAccountExport } from "@/server/export";
import { deleteAccount } from "@/server/account";
import { setStorageForTesting } from "@/server/storage";
import type { ImportBatch } from "@/lib/domain/catalog";
import { baseTasting, baseWine, createUser, sampleJpeg, useTempStorage } from "../support/fixtures";

const at = new Date("2026-10-19T00:00:00Z");
const wikidata = CATALOG_SOURCES.wikidata;

const fixture = (): ImportBatch => ({
  regions: [
    { externalId: "Q-bdx", kind: "region", name: "Bordeaux", country: "FR", parentExternalId: null, aliases: ["Bordeaux wine region"] },
    { externalId: "Q-medoc", kind: "subregion", name: "Médoc", country: "FR", parentExternalId: "Q-bdx", aliases: [] },
    { externalId: "Q-margaux", kind: "appellation", name: "Margaux", country: "FR", parentExternalId: "Q-medoc", aliases: ["Margaux AOC"] },
    // The same appellation name in two countries: never resolved without the label's country.
    { externalId: "Q-va-cl", kind: "appellation", name: "Valle Alto", country: "CL", parentExternalId: null, aliases: [] },
    { externalId: "Q-va-ar", kind: "appellation", name: "Valle Alto", country: "AR", parentExternalId: null, aliases: [] },
  ],
  producers: [
    { externalId: "Q-cm", name: "Château Margaux", country: "FR", regionExternalId: "Q-margaux", aliases: ["Chateau Margaux SA"] },
    { externalId: "Q-cm", name: "Château Margaux duplicate", country: "FR", regionExternalId: null, aliases: [] },
    { externalId: "Q-bad", name: "Bad Country Wines", country: "France", regionExternalId: null, aliases: [] },
  ],
  grapes: [
    { externalId: "Q-cs", name: "Cabernet Sauvignon", aliases: [] },
    { externalId: "Q-me", name: "Merlot", aliases: [] },
  ],
  wines: [{ externalId: "Q-pr", name: "Pavillon Rouge", producerExternalId: "Q-cm", wineType: "red", regionExternalId: "Q-margaux", country: "FR", grapeExternalIds: ["Q-cs", "Q-me"], aliases: ["Pavillon Rouge du Château Margaux"] }],
  products: [],
});

const count = async (table: typeof catalogRegion | typeof catalogProducer | typeof catalogWine | typeof catalogAlias) => Number((await getDb().select({ n: sql<number>`count(*)` }).from(table))[0].n);

beforeAll(() => {
  useTempStorage();
});
beforeEach(() => clearCatalogLookupCache());
afterAll(async () => {
  setStorageForTesting(null);
  setRecognitionProviderForTesting(undefined);
  await closeDb();
});

describe("catalog import", () => {
  it("writes nothing on a dry run but reports what would change", async () => {
    const report = await importCatalogBatch(wikidata, fixture(), { dryRun: true, retrievedAt: at });
    expect(report.dryRun).toBe(true);
    expect(report.regions.inserted).toBe(5);
    expect(await count(catalogRegion)).toBe(0);
    expect(await getDb().select().from(catalogSource)).toEqual([]);
  });

  it("imports, rejects bad records, drops duplicates, and is idempotent", async () => {
    const first = await importCatalogBatch(wikidata, fixture(), { dryRun: false, retrievedAt: at });
    expect(first.producers.inserted).toBe(1);
    expect(first.duplicates).toBe(1);
    expect(first.rejected).toEqual([{ kind: "producers", externalId: "Q-bad", reason: 'invalid country code "France"' }]);
    const aliases = await count(catalogAlias);
    expect(aliases).toBeGreaterThan(0);

    const again = await importCatalogBatch(wikidata, fixture(), { dryRun: false, retrievedAt: at });
    for (const kind of ["regions", "producers", "grapes", "wines"] as const) {
      expect(again[kind]).toMatchObject({ inserted: 0, updated: 0, stale: 0 });
    }
    expect(again.aliases).toEqual({ added: 0, removed: 0 });
    expect(await count(catalogAlias)).toBe(aliases);
    const [medoc] = await getDb().select().from(catalogRegion).where(eq(catalogRegion.externalId, "Q-medoc"));
    const [bdx] = await getDb().select().from(catalogRegion).where(eq(catalogRegion.externalId, "Q-bdx"));
    expect(medoc.parentId).toBe(bdx.id);
    expect(medoc.confidence).toBe(0.9);
  });

  it("updates changed records and reports missing ones as stale without deleting them", async () => {
    const changed = fixture();
    changed.wines[0].aliases = [];
    changed.regions = changed.regions.filter((r) => r.externalId !== "Q-va-ar");
    changed.regions[0] = { ...changed.regions[0], name: "Bordeaux " };
    const r = await importCatalogBatch(wikidata, changed, { dryRun: false, retrievedAt: at });
    expect(r.regions.stale).toBe(1);
    expect(r.aliases.removed).toBe(1);
    expect(await count(catalogRegion)).toBe(5);
    // Restore the full fixture for the lookups below.
    await importCatalogBatch(wikidata, fixture(), { dryRun: false, retrievedAt: at });
  });

  it("rolls back completely when a record fails mid-import", async () => {
    const before = await count(catalogProducer);
    const changed = fixture();
    changed.producers.push({ externalId: "Q-new", name: "New Estate", country: "FR", regionExternalId: null, aliases: [] });
    // An out-of-range confidence violates a check constraint part-way through the transaction.
    const bad = { ...CATALOG_SOURCES.wikidata, confidence: 2 };
    await expect(importCatalogBatch(bad, changed, { dryRun: false, retrievedAt: at })).rejects.toThrow();
    expect(await count(catalogProducer)).toBe(before);
  });

  it("recovers from a failed import by re-running the same batch, and never stores namespace pages", async () => {
    const regions = await count(catalogRegion);
    const aliases = await count(catalogAlias);
    const withCategory = fixture();
    withCategory.regions.push({ externalId: "Q131278789", kind: "region", name: "Category:Aylés (DO)", country: "ES", parentExternalId: null, aliases: ["Aylés"] });
    await expect(importCatalogBatch({ ...CATALOG_SOURCES.wikidata, confidence: 2 }, withCategory, { dryRun: false, retrievedAt: at })).rejects.toThrow();
    expect([await count(catalogRegion), await count(catalogAlias)]).toEqual([regions, aliases]);

    const retry = await importCatalogBatch(wikidata, withCategory, { dryRun: false, retrievedAt: at });
    expect(retry.rejected).toEqual([
      { kind: "regions", externalId: "Q131278789", reason: "a Wikimedia namespace page, not a record" },
      { kind: "producers", externalId: "Q-bad", reason: 'invalid country code "France"' },
    ]);
    expect(retry.regions).toMatchObject({ inserted: 0, updated: 0, stale: 0 });
    expect([await count(catalogRegion), await count(catalogAlias)]).toEqual([regions, aliases]);
    expect(await getDb().select().from(catalogRegion).where(eq(catalogRegion.externalId, "Q131278789"))).toEqual([]);
  });
});

describe("catalog lookup", () => {
  it("matches a producer exactly, through an alias, or by a close spelling", async () => {
    expect((await lookupCatalog({ producer: "Chateau Margaux", name: null, country: null, region: null, appellation: null })).evidence.producer).toMatchObject({ name: "Château Margaux", score: 1 });
    expect((await lookupCatalog({ producer: "Chateau Margaux SA", name: null, country: null, region: null, appellation: null })).evidence.producer?.score).toBe(1);
    const near = (await lookupCatalog({ producer: "Chateau Margau", name: null, country: null, region: null, appellation: null })).evidence.producer;
    expect(near?.name).toBe("Château Margaux");
    expect(near!.score).toBeLessThan(1);
    expect(near!.score).toBeGreaterThanOrEqual(0.6);
    expect((await lookupCatalog({ producer: "Totally Unknown Estate", name: null, country: null, region: null, appellation: null })).matches).toEqual([]);
  });

  it("finds a wine only within a matched producer, with its grapes and place hierarchy", async () => {
    const r = await lookupCatalog({ producer: "Château Margaux", name: "Pavillon Rouge du Chateau Margaux", country: "France", region: null, appellation: "Margaux AOC" });
    expect(r.evidence.wine).toMatchObject({ name: "Pavillon Rouge", score: 1, grapes: ["Cabernet Sauvignon", "Merlot"] });
    expect(r.evidence.place).toMatchObject({ name: "Margaux", region: "Bordeaux", subregion: "Médoc", ambiguous: false });
    const noProducer = await lookupCatalog({ producer: "Someone Else", name: "Pavillon Rouge", country: null, region: null, appellation: null });
    expect(noProducer.evidence.wine).toBeUndefined();
  });

  it("flags a place that exists in several countries unless the label names the country", async () => {
    expect((await lookupCatalog({ producer: null, name: null, country: null, region: null, appellation: "Valle Alto" })).evidence.place?.ambiguous).toBe(true);
    expect((await lookupCatalog({ producer: null, name: null, country: "Chile", region: null, appellation: "Valle Alto" })).evidence.place).toMatchObject({ country: "CL", ambiguous: false });
  });

  it("never uses a source that isn't approved for lookups", async () => {
    await importCatalogBatch(CATALOG_SOURCES.openfoodfacts, { regions: [], producers: [{ externalId: "off-1", name: "Unapproved Bodega", country: "ES", regionExternalId: null, aliases: [] }], grapes: [], wines: [], products: [] }, { dryRun: false, retrievedAt: at });
    expect((await lookupCatalog({ producer: "Unapproved Bodega", name: null, country: null, region: null, appellation: null })).matches).toEqual([]);
  });

  it("answers within its time budget and caches repeated readings", async () => {
    const input = { producer: "Château Margaux", name: "Pavillon Rouge", country: null, region: null, appellation: "Margaux" };
    const t0 = performance.now();
    const first = await lookupCatalog(input);
    expect(performance.now() - t0).toBeLessThan(LOOKUP_TIMEOUT_MS);
    expect(await lookupCatalog(input)).toBe(first);
  });
});

describe("recognition with the catalog", () => {
  const none = { value: null, confidence: 0 };
  const reading: RecognitionCandidate = {
    name: { value: "Pavillon Rouge", confidence: 0.9 },
    producer: { value: "Château Margaux", confidence: 0.95 },
    vintage: { value: null, confidence: 0 },
    isNonVintage: none,
    wineType: none,
    country: none,
    region: none,
    subregion: none,
    appellation: { value: "Margaux", confidence: 0.9 },
    grapes: none,
    alcoholPct: none,
  };

  afterEach(() => setRecognitionProviderForTesting(undefined));

  it("completes a reading from the catalog with one provider call and no invented vintage", async () => {
    let calls = 0;
    const fake: LabelRecognitionProvider = {
      id: "fake",
      displayName: "Fake",
      isConfigured: () => true,
      recognize: async () => {
        calls++;
        return { status: "ok", provider: "fake", extractedText: "PAVILLON ROUGE", candidate: reading, overallConfidence: 0.9, issues: [] };
      },
    };
    setRecognitionProviderForTesting(fake);
    const u = await createUser("cat-rec");
    const img = await uploadImage(u, await sampleJpeg());
    const r = await recognizeLabel(u, img.id);
    expect(calls).toBe(1);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.candidate.region).toMatchObject({ value: "Bordeaux", source: "catalog:wikidata" });
    expect(r.candidate.country).toMatchObject({ value: "France", source: "catalog:wikidata" });
    expect(r.candidate.grapes.value).toEqual(["Cabernet Sauvignon", "Merlot"]);
    expect(r.candidate.producer).toEqual(reading.producer);
    expect(r.candidate.vintage).toEqual({ value: null, confidence: 0 });
    expect(r.candidate.alcoholPct).toEqual(none);
    expect(r.catalog?.filled).toEqual(expect.arrayContaining(["country", "region", "subregion", "wineType", "grapes"]));
  });

  it("leaves a reading untouched when nothing matches", async () => {
    const unknown = { ...reading, producer: { value: "Nobody", confidence: 0.9 }, appellation: none };
    setRecognitionProviderForTesting({ id: "fake", displayName: "Fake", isConfigured: () => true, recognize: async () => ({ status: "ok", provider: "fake", extractedText: "", candidate: unknown, overallConfidence: 0.9, issues: [] }) });
    const u = await createUser("cat-rec2");
    const img = await uploadImage(u, await sampleJpeg());
    const r = await recognizeLabel(u, img.id);
    expect(r).toMatchObject({ status: "ok", candidate: unknown });
    expect((r as { catalog?: unknown }).catalog).toBeUndefined();
  });
});

describe("user contributions", () => {
  afterEach(() => {
    delete process.env.CATALOG_CONTRIBUTIONS;
  });

  it("records nothing unless explicitly enabled", async () => {
    const u = await createUser("contrib-off");
    await saveCapture(u, { wine: baseWine, tasting: baseTasting });
    expect(await getDb().select().from(catalogContribution).where(eq(catalogContribution.userId, u))).toEqual([]);
  });

  it("records one identity per user without vintage or tasting data, exports it and deletes it with the account", async () => {
    process.env.CATALOG_CONTRIBUTIONS = "on";
    const u = await createUser("contrib-on");
    await saveCapture(u, { wine: { ...baseWine, provenance: { region: { source: "provider", provider: "catalog:wikidata", confidence: 0.86 } } }, tasting: baseTasting });
    await saveCapture(u, { wine: { ...baseWine, vintage: 2018 }, tasting: baseTasting });
    const rows = await getDb().select().from(catalogContribution).where(eq(catalogContribution.userId, u));
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0].fields).sort()).toEqual(["appellation", "country", "name", "producer", "region", "wineType"]);
    expect(JSON.stringify(rows[0])).not.toMatch(/2016|2018|8\.4/);
    const exported = await buildAccountExport(u);
    expect(exported.catalogContributions).toHaveLength(1);
    // Contributions never reach the reference catalog on their own.
    expect(await getDb().select().from(catalogWine).where(eq(catalogWine.sourceId, "contributions"))).toEqual([]);
    await deleteAccount(u);
    expect(await getDb().select().from(catalogContribution).where(eq(catalogContribution.userId, u))).toEqual([]);
  });
});

describe("access control", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  it("exposes no app route or component that can write the reference catalog", () => {
    const writers = /server\/reference\/(import|contributions)|setContributionStatus|importCatalogBatch/;
    const offenders = [...files("src/app"), ...files("src/components")].filter((f) => writers.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
