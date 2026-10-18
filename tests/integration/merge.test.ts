import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db";
import { metadataSourceRecord, sensoryObservation, tasting, tastingTag, wine, wineGrape, wineImage } from "@/server/db/schema";
import { createWine, getWineDetail, mergeWines } from "@/server/catalog/wines";
import { createTasting, saveCapture } from "@/server/tastings";
import { uploadImage } from "@/server/images";
import { NotFoundError, UserFacingError } from "@/server/errors";
import { setStorageForTesting } from "@/server/storage";
import { baseTasting, baseWine, createUser, sampleJpeg, useTempStorage } from "../support/fixtures";

let alice: string;
let bob: string;

beforeAll(async () => {
  useTempStorage();
  alice = await createUser("merge-alice");
  bob = await createUser("merge-bob");
});

afterAll(async () => {
  setStorageForTesting(null);
  await closeDb();
});

const label = { source: "provider", provider: "anthropic", confidence: 0.91, confirmedAt: "2026-10-01T10:00:00.000Z" } as const;
const noGrapes = { ...baseWine, grapes: [] };

/** Everything a merge could touch, for comparing before and after a refused merge. */
async function snapshot(...wineIds: string[]) {
  const db = getDb();
  const tastings = await db.select().from(tasting).where(inArray(tasting.wineId, wineIds)).orderBy(asc(tasting.id));
  const tastingIds = tastings.map((t) => t.id);
  return {
    wines: await db.select().from(wine).where(inArray(wine.id, wineIds)).orderBy(asc(wine.id)),
    grapes: await db.select().from(wineGrape).where(inArray(wineGrape.wineId, wineIds)).orderBy(asc(wineGrape.id)),
    tastings,
    observations: tastingIds.length ? await db.select().from(sensoryObservation).where(inArray(sensoryObservation.tastingId, tastingIds)).orderBy(asc(sensoryObservation.id)) : [],
    tags: tastingIds.length ? await db.select().from(tastingTag).where(inArray(tastingTag.tastingId, tastingIds)).orderBy(asc(tastingTag.tag)) : [],
    images: await db.select().from(wineImage).where(inArray(wineImage.wineId, wineIds)).orderBy(asc(wineImage.id)),
    sources: await db.select().from(metadataSourceRecord).where(inArray(metadataSourceRecord.wineId, wineIds)).orderBy(asc(metadataSourceRecord.id)),
  };
}

async function grapesOf(wineId: string) {
  const rows = await getDb().select().from(wineGrape).where(eq(wineGrape.wineId, wineId)).orderBy(asc(wineGrape.position));
  return rows.map((g) => ({ grape: g.grape, percentage: g.percentage === null ? null : Number(g.percentage), source: g.source }));
}

describe("merging duplicate wines", () => {
  it("moves the source's grapes and their provider provenance to a target without grapes", async () => {
    const target = await createWine(alice, { ...noGrapes, name: "Grapes from source" });
    const source = await createWine(alice, {
      ...baseWine,
      name: "Grapes from source",
      grapes: [{ name: "Syrah", percentage: 85 }, { name: "Viognier", percentage: 15 }],
      provenance: { grapes: label },
    });
    await mergeWines(alice, target.id, source.id);
    expect(await grapesOf(target.id)).toEqual([
      { grape: "Syrah", percentage: 85, source: "provider" },
      { grape: "Viognier", percentage: 15, source: "provider" },
    ]);
    expect((await getWineDetail(alice, target.id)).fieldProvenance.grapes).toEqual(label);
  });

  it("keeps the target's grapes, adds the source's new ones and keeps one of each duplicate", async () => {
    const target = await createWine(alice, { ...noGrapes, name: "Union", grapes: [{ name: "Merlot", percentage: 60 }, { name: "Cabernet Franc", percentage: null }] });
    const source = await createWine(alice, { ...noGrapes, name: "Union", grapes: [{ name: "merlot", percentage: 60 }, { name: "Cabernet Franc", percentage: 30 }, { name: "Petit Verdot", percentage: 10 }] });
    await mergeWines(alice, target.id, source.id);
    expect(await grapesOf(target.id)).toEqual([
      { grape: "Merlot", percentage: 60, source: "user" },
      { grape: "Cabernet Franc", percentage: 30, source: "user" },
      { grape: "Petit Verdot", percentage: 10, source: "user" },
    ]);
  });

  it("leaves the target's provider provenance untouched when the source adds nothing new", async () => {
    const target = await createWine(alice, {
      ...baseWine,
      name: "Provider kept",
      provenance: { name: label, vintage: label, grapes: label },
    });
    const source = await createWine(alice, { ...baseWine, name: "Provider kept", grapes: [{ name: "Merlot", percentage: 40 }] });
    const before = (await getWineDetail(alice, target.id)).fieldProvenance;
    await mergeWines(alice, target.id, source.id);
    const after = await getWineDetail(alice, target.id);
    expect(after.fieldProvenance).toEqual(before);
    expect(after.fieldProvenance.grapes).toEqual(label);
    expect((await grapesOf(target.id)).map((g) => g.source)).toEqual(["provider", "provider"]);
  });

  it("keeps every external identifier", async () => {
    const target = await createWine(alice, { ...baseWine, name: "External ids" });
    const source = await createWine(alice, { ...baseWine, name: "External ids" });
    await getDb().update(wine).set({ externalIds: { lwin: "1012345" } }).where(eq(wine.id, target.id));
    await getDb().update(wine).set({ externalIds: { vivino: "88" } }).where(eq(wine.id, source.id));
    await mergeWines(alice, target.id, source.id);
    const [row] = await getDb().select({ externalIds: wine.externalIds }).from(wine).where(eq(wine.id, target.id));
    expect(row.externalIds).toEqual({ lwin: "1012345", vivino: "88" });
  });

  it("moves every dependent record and leaves nothing behind", async () => {
    const target = await createWine(alice, { ...baseWine, name: "Dependants" });
    const img = await uploadImage(alice, await sampleJpeg());
    const captured = await saveCapture(alice, {
      wine: { ...baseWine, name: "Dependants" },
      tasting: { ...baseTasting, tags: ["cellar"] },
      imageIds: [img.id],
      recognition: { provider: "anthropic", imageId: img.id, extractedText: "Les Pagodes de Cos 2016", candidate: { name: "Les Pagodes de Cos" }, confidence: 0.9 },
    });
    const second = await createTasting(alice, captured.wineId, { ...baseTasting, personalScore: 7 });
    const before = await snapshot(captured.wineId);

    const result = await mergeWines(alice, target.id, captured.wineId);

    expect(result.movedTastings).toBe(2);
    const after = await snapshot(target.id);
    expect(after.tastings.map((t) => t.id).sort()).toEqual([captured.tastingId, second.id].sort());
    expect(after.observations.map((o) => o.id)).toEqual(before.observations.map((o) => o.id));
    expect(after.tags).toEqual(before.tags);
    expect(after.tags.map((t) => t.tag)).toContain("cellar");
    expect(after.images.map((i) => i.id)).toEqual([img.id]);
    expect(after.sources.map((s) => s.id)).toEqual(before.sources.map((s) => s.id));
    expect(after.sources[0].imageId).toBe(img.id);
    expect(await snapshot(captured.wineId)).toEqual({ wines: [], grapes: [], tastings: [], observations: [], tags: [], images: [], sources: [] });
  });

  it("refuses different known vintages and changes nothing", async () => {
    const target = await createWine(alice, { ...baseWine, name: "Vintages", vintage: 2015 });
    const source = await createWine(alice, { ...baseWine, name: "Vintages", vintage: 2016 });
    await createTasting(alice, source.id, baseTasting);
    const before = await snapshot(target.id, source.id);
    await expect(mergeWines(alice, target.id, source.id)).rejects.toThrow("different vintages (2015 and 2016)");
    expect(await snapshot(target.id, source.id)).toEqual(before);
  });

  it("never treats non-vintage and unknown vintage as the same", async () => {
    const nv = await createWine(alice, { ...baseWine, name: "Vintage states", vintage: null, isNonVintage: true });
    const unknown = await createWine(alice, { ...baseWine, name: "Vintage states", vintage: null, isNonVintage: false });
    const known = await createWine(alice, { ...baseWine, name: "Vintage states", vintage: 2019 });
    const before = await snapshot(nv.id, unknown.id, known.id);
    await expect(mergeWines(alice, nv.id, unknown.id)).rejects.toThrow("non-vintage and vintage unknown");
    await expect(mergeWines(alice, unknown.id, nv.id)).rejects.toThrow("vintage unknown and non-vintage");
    await expect(mergeWines(alice, known.id, unknown.id)).rejects.toThrow("2019 and vintage unknown");
    expect(await snapshot(nv.id, unknown.id, known.id)).toEqual(before);

    const nv2 = await createWine(alice, { ...baseWine, name: "Vintage states", vintage: null, isNonVintage: true });
    await mergeWines(alice, nv.id, nv2.id);
    const merged = await getWineDetail(alice, nv.id);
    expect(merged.isNonVintage).toBe(true);
    expect(merged.vintage).toBeNull();
  });

  it("refuses conflicting grape shares and changes nothing", async () => {
    const target = await createWine(alice, { ...noGrapes, name: "Share conflict", grapes: [{ name: "Merlot", percentage: 60 }] });
    const source = await createWine(alice, { ...noGrapes, name: "Share conflict", grapes: [{ name: "Merlot", percentage: 70 }, { name: "Malbec", percentage: 30 }] });
    await createTasting(alice, source.id, baseTasting);
    const before = await snapshot(target.id, source.id);
    const attempt = mergeWines(alice, target.id, source.id);
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError);
    await expect(attempt).rejects.toThrow("Merlot is 60% on this record but 70% on the duplicate");
    expect(await snapshot(target.id, source.id)).toEqual(before);
  });

  it("refuses a combination over 100% or of grapes from different origins, changing nothing", async () => {
    const target = await createWine(alice, { ...noGrapes, name: "Over 100", grapes: [{ name: "Merlot", percentage: 70 }] });
    const source = await createWine(alice, { ...noGrapes, name: "Over 100", grapes: [{ name: "Malbec", percentage: 40 }] });
    const mine = await createWine(alice, { ...noGrapes, name: "Origins", grapes: [{ name: "Merlot", percentage: null }] });
    const read = await createWine(alice, { ...noGrapes, name: "Origins", grapes: [{ name: "Malbec", percentage: null }], provenance: { grapes: label } });
    const before = await snapshot(target.id, source.id, mine.id, read.id);
    await expect(mergeWines(alice, target.id, source.id)).rejects.toThrow("110%");
    await expect(mergeWines(alice, mine.id, read.id)).rejects.toThrow("came from different sources");
    expect(await snapshot(target.id, source.id, mine.id, read.id)).toEqual(before);
  });

  it("refuses conflicting external identifiers, changing nothing", async () => {
    const target = await createWine(alice, { ...baseWine, name: "Id conflict" });
    const source = await createWine(alice, { ...baseWine, name: "Id conflict" });
    await getDb().update(wine).set({ externalIds: { lwin: "1" } }).where(eq(wine.id, target.id));
    await getDb().update(wine).set({ externalIds: { lwin: "2" } }).where(eq(wine.id, source.id));
    const before = await snapshot(target.id, source.id);
    await expect(mergeWines(alice, target.id, source.id)).rejects.toThrow("different lwin identifiers");
    expect(await snapshot(target.id, source.id)).toEqual(before);
  });

  it("rolls back every step when the merge fails part-way", async () => {
    const target = await createWine(alice, { ...noGrapes, name: "Part-way" });
    const source = await createWine(alice, { ...baseWine, name: "Part-way failure" });
    await createTasting(alice, source.id, baseTasting);
    const before = await snapshot(target.id, source.id);
    // Make the final step (deleting the source) fail after tastings and grapes have moved.
    await getDb().execute(sql.raw(`
      CREATE FUNCTION test_block_wine_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_block_wine_delete BEFORE DELETE ON wine FOR EACH ROW
        WHEN (OLD.id = '${source.id}') EXECUTE FUNCTION test_block_wine_delete();
    `));
    try {
      await expect(mergeWines(alice, target.id, source.id)).rejects.toThrow();
    } finally {
      await getDb().execute(sql.raw(`DROP TRIGGER test_block_wine_delete ON wine; DROP FUNCTION test_block_wine_delete();`));
    }
    expect(await snapshot(target.id, source.id)).toEqual(before);
  });

  it("refuses unknown, malformed, identical and other users' wines", async () => {
    const mine = await createWine(alice, { ...baseWine, name: "Authz" });
    const theirs = await createWine(bob, { ...baseWine, name: "Authz" });
    await createTasting(bob, theirs.id, baseTasting);
    const before = await snapshot(mine.id, theirs.id);
    await expect(mergeWines(alice, mine.id, theirs.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mergeWines(alice, theirs.id, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mergeWines(alice, mine.id, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(mergeWines(alice, mine.id, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
    await expect(mergeWines(alice, mine.id, mine.id)).rejects.toThrow("two different wines");
    expect(await snapshot(mine.id, theirs.id)).toEqual(before);
  });
});
