import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db";
import { producer, region, sensoryObservation, tasting, tastingTag, wine, wineGrape, wineImage } from "@/server/db/schema";
import { createWine, deleteWine, findWineMatches, getWineDetail, mergeWines, updateWine } from "@/server/catalog/wines";
import { createTasting, deleteTasting, getTasting, listTastingsForWine, saveCapture, updateTasting } from "@/server/tastings";
import { searchJournal, listWines, journalFacets } from "@/server/journal";
import { loadAnalyticsRows, overviewStats } from "@/server/analytics";
import { NotFoundError, ValidationError } from "@/server/errors";
import { setStorageForTesting } from "@/server/storage";
import { baseTasting, baseWine, createUser, useTempStorage } from "../support/fixtures";

let alice: string;
let bob: string;

beforeAll(async () => {
  useTempStorage();
  alice = await createUser("alice");
  bob = await createUser("bob");
});

afterAll(async () => {
  setStorageForTesting(null);
  await closeDb();
});

describe("wine and tasting lifecycle", () => {
  it("creates a wine with producer, region hierarchy and grapes", async () => {
    const w = await createWine(alice, baseWine);
    const d = await getWineDetail(alice, w.id);
    expect(d.producer?.name).toBe("Château Cos d'Estournel");
    expect(d.regionPath).toEqual({ region: "Bordeaux", subregion: "Médoc" });
    expect(d.grapes.map((g) => [g.grape, Number(g.percentage)])).toEqual([["Cabernet Sauvignon", 60], ["Merlot", 40]]);
    expect(d.fieldProvenance.name).toEqual({ source: "user" });
  });

  it("keeps multiple tastings of one wine separate and never overwrites earlier ones", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Multi" });
    const first = await createTasting(alice, w.id, baseTasting);
    const second = await createTasting(alice, w.id, { ...baseTasting, tastedOn: "2026-04-01", personalScore: 6.5, notes: "Closed down." });
    await updateTasting(alice, second.id, { ...baseTasting, tastedOn: "2026-04-01", personalScore: 7.0, notes: "Opened up later." });
    const list = await listTastingsForWine(alice, w.id);
    expect(list).toHaveLength(2);
    const original = list.find((t) => t.id === first.id)!;
    expect(Number(original.personalScore)).toBe(8.4);
    expect(original.notes).toBe("Opened two hours ahead.");
    const edited = list.find((t) => t.id === second.id)!;
    expect(Number(edited.personalScore)).toBe(7);
    expect(edited.observations.filter((o) => o.dimension === "aroma")).toHaveLength(2);
    expect(edited.tags).toEqual(["bordeaux night"]);
  });

  it("stores unrated tastings as null and non-assessed dimensions as absent rows", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Unrated", wineType: "white" });
    const t = await createTasting(alice, w.id, {
      tastedOn: "2026-02-02",
      observations: [{ dimension: "tannin", status: "not_applicable" }, { dimension: "acidity", status: "unknown" }],
    });
    const full = await getTasting(alice, t.id);
    expect(full.personalScore).toBeNull();
    expect(full.purchasePrice).toBeNull();
    expect(full.observations.map((o) => [o.dimension, o.status, o.value]).sort()).toEqual([
      ["acidity", "unknown", null],
      ["tannin", "not_applicable", null],
    ]);
    expect(full.observations.find((o) => o.dimension === "body")).toBeUndefined();
  });

  it("preserves price currency and rejects a price without one", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Priced" });
    const t = await createTasting(alice, w.id, { ...baseTasting, purchasePrice: 42.5, currency: "EUR", priceBasis: "restaurant_bottle" });
    const full = await getTasting(alice, t.id);
    expect([full.purchasePrice, full.currency, full.priceBasis]).toEqual(["42.50", "EUR", "restaurant_bottle"]);
    await expect(createTasting(alice, w.id, { ...baseTasting, currency: null })).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces score limits at the database level too", async () => {
    const w = await createWine(alice, { ...baseWine, name: "DB constraint" });
    await expect(
      getDb().insert(tasting).values({ ownerId: alice, wineId: w.id, tastedOn: "2026-01-01", personalScore: "10.5" }),
    ).rejects.toThrow();
  });

  it("marks edited fields as user-sourced while keeping confirmed provider provenance", async () => {
    const w = await createWine(alice, {
      ...baseWine,
      name: "Provenance",
      provenance: { name: { source: "provider", provider: "anthropic", confidence: 0.92 }, vintage: { source: "provider", provider: "anthropic", confidence: 0.8 } },
    });
    const before = await getWineDetail(alice, w.id);
    expect(before.fieldProvenance.name.source).toBe("provider");
    expect(before.fieldProvenance.name.confirmedAt).toBeTruthy();
    await updateWine(alice, w.id, { ...baseWine, name: "Provenance", vintage: 2017 });
    const after = await getWineDetail(alice, w.id);
    expect(after.fieldProvenance.name.source).toBe("provider");
    expect(after.fieldProvenance.vintage).toEqual({ source: "user" });
  });

  it("keeps grape and vintage provenance when an edit leaves them unchanged", async () => {
    const input = {
      ...baseWine,
      name: "Unchanged blend",
      grapes: [{ name: "Merlot", percentage: 60 }, { name: "Cabernet Franc", percentage: 40 }],
      provenance: { grapes: { source: "provider", provider: "anthropic", confidence: 0.9 } },
    };
    const w = await createWine(alice, input);
    const rowsBefore = await getDb().select({ id: wineGrape.id }).from(wineGrape).where(eq(wineGrape.wineId, w.id));
    await updateWine(alice, w.id, { ...input, provenance: undefined });
    const after = await getWineDetail(alice, w.id);
    expect(after.fieldProvenance.grapes.source).toBe("provider");
    const rowsAfter = await getDb().select({ id: wineGrape.id }).from(wineGrape).where(eq(wineGrape.wineId, w.id));
    expect(rowsAfter.map((r) => r.id).sort()).toEqual(rowsBefore.map((r) => r.id).sort());
    expect(after.grapes.map((g) => [g.grape, Number(g.percentage)])).toEqual([["Merlot", 60], ["Cabernet Franc", 40]]);
  });

  it("treats a change between non-vintage and unknown vintage as a user edit", async () => {
    const w = await createWine(alice, {
      ...baseWine,
      name: "NV or unknown",
      vintage: null,
      isNonVintage: true,
      provenance: { vintage: { source: "provider", provider: "anthropic", confidence: 0.9 } },
    });
    await updateWine(alice, w.id, { ...baseWine, name: "NV or unknown", vintage: null, isNonVintage: false });
    const after = await getWineDetail(alice, w.id);
    expect(after.isNonVintage).toBe(false);
    expect(after.fieldProvenance.vintage).toEqual({ source: "user" });
  });

  it("deletes a tasting without touching the wine or its other tastings", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Delete one" });
    const a = await createTasting(alice, w.id, baseTasting);
    const b = await createTasting(alice, w.id, baseTasting);
    await deleteTasting(alice, a.id);
    const remaining = await listTastingsForWine(alice, w.id);
    expect(remaining.map((t) => t.id)).toEqual([b.id]);
    const orphanObs = await getDb().select().from(sensoryObservation).where(eq(sensoryObservation.tastingId, a.id));
    expect(orphanObs).toHaveLength(0);
  });

  it("deleting a wine removes tastings, observations, tags and images", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Delete all" });
    const t = await createTasting(alice, w.id, baseTasting);
    await deleteWine(alice, w.id);
    const db = getDb();
    expect(await db.select().from(tasting).where(eq(tasting.id, t.id))).toHaveLength(0);
    expect(await db.select().from(sensoryObservation).where(eq(sensoryObservation.tastingId, t.id))).toHaveLength(0);
    expect(await db.select().from(tastingTag).where(eq(tastingTag.tastingId, t.id))).toHaveLength(0);
    expect(await db.select().from(wineImage).where(eq(wineImage.wineId, w.id))).toHaveLength(0);
  });
});

describe("capture save", () => {
  it("creates wine and tasting atomically and records recognition provenance", async () => {
    const r = await saveCapture(alice, {
      wine: { ...baseWine, name: "Captured" },
      tasting: baseTasting,
      recognition: { provider: "anthropic", imageId: null, extractedText: "CAPTURED 2016", candidate: { name: "Captured" }, confidence: 0.8 },
    });
    const d = await getWineDetail(alice, r.wineId);
    expect(d.sources).toHaveLength(1);
    expect(d.sources[0].extractedText).toBe("CAPTURED 2016");
    expect(await listTastingsForWine(alice, r.wineId)).toHaveLength(1);
  });

  it("rolls back the new wine when the tasting is invalid", async () => {
    const count = async () => (await getDb().select().from(wine).where(eq(wine.ownerId, alice))).length;
    const before = await count();
    await expect(saveCapture(alice, { wine: { ...baseWine, name: "Rollback" }, tasting: { tastedOn: "not a date" } })).rejects.toBeInstanceOf(ValidationError);
    expect(await count()).toBe(before);
  });

  it("adds a tasting to an existing wine", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Existing" });
    const r = await saveCapture(alice, { wineId: w.id, tasting: baseTasting });
    expect(r.wineId).toBe(w.id);
  });
});

describe("duplicate detection and merging", () => {
  it("finds the same wine despite accents and producer prefixes, and other vintages", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Dup Cuvée", producer: "Domaine Dupont", vintage: 2018 });
    const other = await createWine(alice, { ...baseWine, name: "Dup Cuvee", producer: "Dupont", vintage: 2019 });
    const matches = await findWineMatches(alice, { producer: "dupont", name: "dup cuvée", vintage: 2018 });
    expect(matches.find((m) => m.id === w.id)?.match).toBe("same_wine");
    expect(matches.find((m) => m.id === other.id)?.match).toBe("other_vintage");
    expect(matches[0].id).toBe(w.id);
    expect(await findWineMatches(bob, { producer: "dupont", name: "dup cuvée", vintage: 2018 })).toEqual([]);
  });

  it("merges two records, moving every tasting intact", async () => {
    const target = await createWine(alice, { ...baseWine, name: "Merge target" });
    const source = await createWine(alice, { ...baseWine, name: "Merge target " });
    const t1 = await createTasting(alice, target.id, { ...baseTasting, personalScore: 9 });
    const t2 = await createTasting(alice, source.id, { ...baseTasting, personalScore: 6.1, notes: "From the duplicate" });
    const result = await mergeWines(alice, target.id, source.id);
    expect(result.movedTastings).toBe(1);
    const list = await listTastingsForWine(alice, target.id);
    expect(list.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
    expect(Number(list.find((t) => t.id === t2.id)!.personalScore)).toBe(6.1);
    await expect(getWineDetail(alice, source.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to merge a wine into itself or across users", async () => {
    const a = await createWine(alice, { ...baseWine, name: "Mine" });
    const b = await createWine(bob, { ...baseWine, name: "Theirs" });
    await expect(mergeWines(alice, a.id, a.id)).rejects.toThrow();
    await expect(mergeWines(alice, a.id, b.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getWineDetail(bob, b.id)).id).toBe(b.id);
  });
});

describe("user isolation", () => {
  it("never exposes or modifies another user's records", async () => {
    const w = await createWine(alice, { ...baseWine, name: "Private" });
    const t = await createTasting(alice, w.id, baseTasting);
    await expect(getWineDetail(bob, w.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getTasting(bob, t.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateWine(bob, w.id, baseWine)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTasting(bob, t.id, baseTasting)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTasting(bob, t.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteWine(bob, w.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createTasting(bob, w.id, baseTasting)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveCapture(bob, { wineId: w.id, tasting: baseTasting })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getTasting(alice, t.id)).id).toBe(t.id);
  });

  it("scopes search, analytics and stats to the owner", async () => {
    const carol = await createUser("carol");
    expect((await searchJournal(carol, {})).entries).toEqual([]);
    expect(await loadAnalyticsRows(carol)).toEqual([]);
    expect(await overviewStats(carol)).toMatchObject({ wines: 0, tastings: 0, meanScore: null });
    const bobRows = await loadAnalyticsRows(bob);
    expect(bobRows.every((r) => r.wineName !== "Private")).toBe(true);
  });

  it("keeps producers and regions per user", async () => {
    const aliceProducers = await getDb().select().from(producer).where(eq(producer.ownerId, alice));
    const bobRegions = await getDb().select().from(region).where(eq(region.ownerId, bob));
    expect(aliceProducers.length).toBeGreaterThan(0);
    expect(bobRegions.every((r) => r.ownerId === bob)).toBe(true);
  });

  it("treats malformed ids as not found rather than erroring", async () => {
    await expect(getWineDetail(alice, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getTasting(alice, "../../etc")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("journal search", () => {
  it("searches across producer, grape, region, notes and descriptors", async () => {
    const dave = await createUser("dave");
    const w = await createWine(dave, { ...baseWine, name: "Searchable", grapes: [{ name: "Nebbiolo" }], country: "IT", region: "Piedmont", subregion: null, appellation: "Barolo" });
    await createTasting(dave, w.id, { ...baseTasting, notes: "Tar and roses", observations: [{ dimension: "aroma", status: "assessed", descriptor: "Violet" }] });
    for (const q of ["nebbiolo", "Piedmont", "tar roses", "violet", "estournel", "2016", "barolo"]) {
      expect((await searchJournal(dave, { q })).entries.length, q).toBe(1);
    }
    expect((await searchJournal(dave, { q: "sauvignon blanc" })).entries).toHaveLength(0);
    expect((await searchJournal(dave, { q: "100%" })).entries).toHaveLength(0);
  });

  it("filters by type, grape, region, score and date, and sorts", async () => {
    const erin = await createUser("erin");
    const red = await createWine(erin, { ...baseWine, name: "Red one" });
    const white = await createWine(erin, { ...baseWine, name: "White one", wineType: "white", grapes: [{ name: "Chardonnay" }] });
    await createTasting(erin, red.id, { ...baseTasting, tastedOn: "2026-01-10", personalScore: 9 });
    await createTasting(erin, white.id, { ...baseTasting, tastedOn: "2026-02-10", personalScore: 6 });
    await createTasting(erin, white.id, { ...baseTasting, tastedOn: "2026-03-10", personalScore: null });
    expect((await searchJournal(erin, { type: "white" })).entries).toHaveLength(2);
    expect((await searchJournal(erin, { grape: "chardonnay" })).entries).toHaveLength(2);
    expect((await searchJournal(erin, { region: "medoc" })).entries).toHaveLength(3);
    expect((await searchJournal(erin, { scoreMin: 7 })).entries).toHaveLength(1);
    expect((await searchJournal(erin, { from: "2026-02-01", to: "2026-02-28" })).entries).toHaveLength(1);
    const byScore = (await searchJournal(erin, { sort: "score_desc" })).entries.map((e) => e.score);
    expect(byScore).toEqual(["9.0", "6.0", null]);
    const wines = await listWines(erin, {});
    expect(wines.wines.find((w) => w.wineId === white.id)).toMatchObject({ tastingCount: 2, ratedCount: 1, meanScore: 6 });
    const facets = await journalFacets(erin);
    expect(facets.grapes).toEqual(["Cabernet Sauvignon", "Chardonnay", "Merlot"]);
  });
});
