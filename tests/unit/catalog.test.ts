import { describe, expect, it } from "vitest";
import {
  contributionConsensus,
  contributionKey,
  enrichFromCatalog,
  normalizeBarcode,
  validateBatch,
  type CatalogEvidence,
  type EnrichableFields,
  type ImportBatch,
} from "@/lib/domain/catalog";
import { countryCodeFromName, countryName } from "@/lib/domain/countries";
import { wikidataToBatch, type SparqlResult } from "@/server/reference/wikidata";
import { openFoodFactsToBatch, parseVolumeMl } from "@/server/reference/openfoodfacts";
import { CATALOG_SOURCES } from "@/server/reference/sources";
import { applyCandidate, emptyIdentity, identityToPayload } from "@/components/capture/drafts";
import type { RecognitionCandidate } from "@/server/recognition/types";

const none = { value: null, confidence: 0 };
const reading = (over: Partial<EnrichableFields> = {}): EnrichableFields => ({
  producer: none, name: none, wineType: none, country: none, region: none, subregion: none, appellation: none, grapes: none,
  ...over,
});
const enrich = <T extends EnrichableFields>(r: T, ev: CatalogEvidence) => enrichFromCatalog(r, ev, countryCodeFromName, countryName);

const margauxPlace: CatalogEvidence["place"] = { kind: "appellation", name: "Margaux", country: "FR", region: "Bordeaux", subregion: "Médoc", score: 1, confidence: 0.9, source: "wikidata", ambiguous: false };
const margauxWine: CatalogEvidence["wine"] = { name: "Pavillon Rouge", producer: "Château Margaux", wineType: "red", grapes: ["Cabernet Sauvignon", "Merlot"], score: 1, confidence: 0.9, source: "wikidata" };

describe("barcodes", () => {
  it("accepts valid GTINs and stores UPC-A as EAN-13", () => {
    expect(normalizeBarcode("4006381333931")).toBe("4006381333931");
    expect(normalizeBarcode("0360-0029 1452")).toBe("0036000291452");
    expect(normalizeBarcode("96385074")).toBe("96385074");
  });
  it("rejects bad check digits, lengths and non-digits", () => {
    expect(normalizeBarcode("4006381333932")).toBeNull();
    expect(normalizeBarcode("123")).toBeNull();
    expect(normalizeBarcode("40063813339x1")).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
  });
});

describe("import validation", () => {
  const batch = (over: Partial<ImportBatch>): ImportBatch => ({ regions: [], producers: [], grapes: [], wines: [], products: [], ...over });
  it("rejects untrustworthy records with a reason and drops duplicates", () => {
    const v = validateBatch(
      batch({
        producers: [
          { externalId: "Q1", name: "Château Margaux", country: "FR", regionExternalId: null, aliases: ["Chateau Margaux", "château margaux", "Ch. Margaux", ""] },
          { externalId: "Q1", name: "Duplicate", country: "FR", regionExternalId: null, aliases: [] },
          { externalId: "Q2", name: "  ", country: "FR", regionExternalId: null, aliases: [] },
          { externalId: "Q3", name: "Bad Country", country: "France", regionExternalId: null, aliases: [] },
          { externalId: "", name: "No id", country: null, regionExternalId: null, aliases: [] },
        ],
        wines: [{ externalId: "W1", name: "X", producerExternalId: null, wineType: "purple", regionExternalId: null, country: null, grapeExternalIds: ["G1", "G1"], aliases: [] }],
        products: [
          { externalId: "P1", barcode: "4006381333932", productName: "A", producerName: null, wineExternalId: null, vintage: null, isNonVintage: false, volumeMl: 750, alcoholPct: 13, country: null },
          { externalId: "P2", barcode: null, productName: "B", producerName: null, wineExternalId: null, vintage: 2015, isNonVintage: true, volumeMl: null, alcoholPct: null, country: null },
          { externalId: "P3", barcode: null, productName: "C", producerName: null, wineExternalId: null, vintage: 1700, isNonVintage: false, volumeMl: null, alcoholPct: null, country: null },
          { externalId: "P4", barcode: null, productName: "D", producerName: null, wineExternalId: null, vintage: null, isNonVintage: false, volumeMl: null, alcoholPct: 40, country: null },
        ],
      }),
    );
    expect(v.batch.producers).toHaveLength(1);
    // Accents/case variants of the name itself are not aliases; true variants are kept once.
    expect(v.batch.producers[0].aliases).toEqual(["Ch. Margaux"]);
    expect(v.duplicates).toEqual([{ kind: "producers", externalId: "Q1" }]);
    expect(v.rejected.map((r) => r.reason)).toEqual([
      "missing name",
      'invalid country code "France"',
      "missing external id",
      'unknown wine type "purple"',
      'invalid barcode "4006381333932"',
      "both non-vintage and a vintage",
      "implausible vintage 1700",
      "implausible alcohol 40%",
    ]);
  });
});

describe("catalog enrichment", () => {
  it("fills only empty fields and never touches vintage or alcohol", () => {
    const r = { ...reading({ producer: { value: "Château Margaux", confidence: 0.95 }, name: { value: "Pavillon Rouge", confidence: 0.9 }, appellation: { value: "Margaux", confidence: 0.9 } }), vintage: { value: null, confidence: 0 }, alcoholPct: { value: null, confidence: 0 } };
    const e = enrich(r, { place: margauxPlace, wine: margauxWine, producer: { name: "Château Margaux", country: "FR", score: 1, confidence: 0.9, source: "wikidata" } });
    expect(e.fields.country).toEqual({ value: "France", confidence: 0.86, source: "wikidata" });
    expect(e.fields.region.value).toBe("Bordeaux");
    expect(e.fields.subregion.value).toBe("Médoc");
    expect(e.fields.wineType.value).toBe("red");
    expect(e.fields.grapes.value).toEqual(["Cabernet Sauvignon", "Merlot"]);
    expect(e.fields.vintage).toEqual({ value: null, confidence: 0 });
    expect(e.fields.alcoholPct).toEqual({ value: null, confidence: 0 });
    expect(e.filled.sort()).toEqual(["country", "grapes", "region", "subregion", "wineType"]);
    expect(e.agreed).toContain("producer");
    expect(e.conflicts).toEqual([]);
  });

  it("keeps the label's values and reports conflicts", () => {
    const e = enrich(reading({ wineType: { value: "white", confidence: 0.8 }, country: { value: "Italy", confidence: 0.8 }, grapes: { value: ["Nebbiolo"], confidence: 0.7 } }), {
      place: margauxPlace,
      wine: margauxWine,
    });
    expect(e.fields.wineType.value).toBe("white");
    expect(e.fields.country.value).toBe("Italy");
    expect(e.fields.grapes.value).toEqual(["Nebbiolo"]);
    expect(e.conflicts.sort()).toEqual(["country", "grapes", "region", "wineType"]);
    // A place in another country than the label's must not fill region.
    expect(e.fields.region.value).toBeNull();
  });

  it("offers near matches only as low-confidence suggestions, and no grapes from them", () => {
    const e = enrich(reading(), { place: { ...margauxPlace, score: 0.7 }, wine: { ...margauxWine, score: 0.7 } });
    expect(e.fields.region).toEqual({ value: "Bordeaux", confidence: 0.5, source: "wikidata" });
    expect(e.fields.grapes.value).toBeNull();
    expect(e.fields.wineType.confidence).toBe(0.5);
  });

  it("never fills from an ambiguous place or below the suggestion threshold", () => {
    expect(enrich(reading(), { place: { ...margauxPlace, ambiguous: true } }).filled).toEqual([]);
    expect(enrich(reading(), { place: { ...margauxPlace, score: 0.5 } }).filled).toEqual([]);
  });

  it("drops the country when the place and producer disagree", () => {
    const e = enrich(reading(), { place: margauxPlace, producer: { name: "X", country: "IT", score: 1, confidence: 0.9, source: "wikidata" } });
    expect(e.fields.country.value).toBeNull();
    expect(e.conflicts).toContain("country");
  });

  it("treats an unrecognised country name as neither agreement nor conflict", () => {
    const e = enrich(reading({ country: { value: "Narnia", confidence: 0.9 } }), { place: margauxPlace });
    expect(e.agreed).not.toContain("country");
    expect(e.conflicts).not.toContain("country");
  });

  it("is capped by the source's confidence", () => {
    const e = enrich(reading(), { place: { ...margauxPlace, confidence: 0.7 } });
    expect(e.fields.region.confidence).toBe(0.66);
  });
});

describe("contribution consensus", () => {
  const f = { producer: "Domaine Tempier", name: "Bandol Rosé", country: "FR", region: "Provence", appellation: "Bandol", wineType: "rose" };
  it("needs three independent agreeing users", () => {
    expect(contributionConsensus([f, f]).accept).toBe(false);
    expect(contributionConsensus([f, { ...f, producer: "Tempier" }, { ...f, appellation: null }])).toMatchObject({ accept: true, fields: { appellation: "Bandol" } });
  });
  it("blocks on any disagreement", () => {
    expect(contributionConsensus([f, f, { ...f, wineType: "red" }])).toMatchObject({ accept: false, reason: "users disagree on wineType" });
  });
  it("groups by producer and name, not vintage", () => {
    expect(contributionKey("Domaine Tempier", "Bandol Rosé")).toBe(contributionKey("Tempier", "bandol rose"));
  });
});

describe("source parsers", () => {
  const res = (bindings: Record<string, string>[]): SparqlResult => ({
    head: { vars: [] },
    results: { bindings: bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { type: "literal", value: v }]))) },
  });
  const wd = (id: string) => `http://www.wikidata.org/entity/${id}`;
  it("converts Wikidata results and drops links outside the set", () => {
    const b = wikidataToBatch({
      regions: res([
        { item: wd("Q1"), itemLabel: "Bordeaux", iso: "fr", kind: "region", parent: wd("Q999") },
        { item: wd("Q2"), itemLabel: "Margaux", iso: "fr", kind: "appellation", parent: wd("Q1"), alts: "Margaux AOC|AOC Margaux" },
        { item: wd("Q3"), itemLabel: "Q3" },
      ]),
      producers: res([{ item: wd("Q10"), itemLabel: "Château Margaux", iso: "FR", region: wd("Q2") }]),
      grapes: res([{ item: wd("Q20"), itemLabel: "Merlot" }]),
      wines: res([{ item: wd("Q30"), itemLabel: "Pavillon Rouge", producer: wd("Q10"), grapes: `${wd("Q20")}|${wd("Q21")}` }]),
    });
    expect(b.regions.map((r) => [r.externalId, r.kind, r.country, r.parentExternalId])).toEqual([
      ["Q1", "region", "FR", null],
      ["Q2", "appellation", "FR", "Q1"],
    ]);
    expect(b.regions[1].aliases).toEqual(["Margaux AOC", "AOC Margaux"]);
    expect(b.producers[0].regionExternalId).toBe("Q2");
    expect(b.wines[0]).toMatchObject({ producerExternalId: "Q10", grapeExternalIds: ["Q20"], wineType: null });
  });

  it("keeps only Open Food Facts wines, never a vintage, and counts bad lines", () => {
    const lines = [
      JSON.stringify({ code: "4006381333931", product_name: "Rioja Crianza", brands: "Bodegas X, Group Y", quantity: "75 cl", categories_tags: ["en:wines"], origins_tags: ["en:spain"], nutriments: { alcohol: 13.5 } }),
      JSON.stringify({ code: "123", product_name: "Cola", categories_tags: ["en:sodas"] }),
      "{not json",
      "",
    ];
    const { batch, malformed, skippedNotWine } = openFoodFactsToBatch(lines);
    expect([malformed, skippedNotWine]).toEqual([1, 1]);
    expect(batch.products[0]).toMatchObject({ barcode: "4006381333931", producerName: "Bodegas X", volumeMl: 750, alcoholPct: 13.5, country: "ES", vintage: null });
    expect([parseVolumeMl("0,75 L"), parseVolumeMl("750ml"), parseVolumeMl("a bottle")]).toEqual([750, 750, null]);
  });

  it("keeps Open Food Facts out of lookups until its licence is approved", () => {
    expect(CATALOG_SOURCES.openfoodfacts.approvedForLookup).toBe(false);
    expect(CATALOG_SOURCES.wikidata.approvedForLookup).toBe(true);
  });
});

describe("form pre-fill from catalog values", () => {
  const cand = (over: Partial<RecognitionCandidate>): RecognitionCandidate => ({
    name: none, producer: none, vintage: none, isNonVintage: none, wineType: none, country: none, region: none, subregion: none, appellation: none, grapes: none, alcoholPct: none,
    ...over,
  });
  it("marks catalog-filled fields with the catalog as their source", () => {
    const { draft, suggestions } = applyCandidate(
      emptyIdentity(),
      cand({ name: { value: "Pavillon Rouge", confidence: 0.9 }, region: { value: "Bordeaux", confidence: 0.86, source: "catalog:wikidata" }, subregion: { value: "Médoc", confidence: 0.5, source: "catalog:wikidata" } }),
      "anthropic",
    );
    expect(draft.fromProvider.name?.provider).toBe("anthropic");
    expect(draft.fromProvider.region).toEqual({ provider: "catalog:wikidata", confidence: 0.86 });
    expect(draft.subregion).toBe("");
    expect(suggestions.map((s) => s.field)).toEqual(["subregion"]);
    const accepted = suggestions[0].apply(draft);
    expect(accepted.fromProvider.subregion?.provider).toBe("catalog:wikidata");
    expect(identityToPayload({ ...accepted, country: "FR", wineType: "red" }).provenance?.region).toMatchObject({ source: "provider", provider: "catalog:wikidata" });
  });
});

describe("catalog script database guard", async () => {
  const { databaseTarget } = await import("../../scripts/catalog/target");
  const prod = "ep-prod-branch-abc123";
  const withEnv = (env: Record<string, string | undefined>, fn: () => unknown) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      return fn();
    } finally {
      process.env = saved;
    }
  };
  // Placeholder credentials; the guard runs before any connection is made.
  const neon = (ep: string) => `postgresql://u:p@${ep}.us-east-2.aws.neon.tech/db`;

  it("refuses Production unless explicitly allowed and confirmed by endpoint", () => {
    const env = { DATABASE_URL: neon(prod), PRODUCTION_DB_ENDPOINT_ID: prod, VERCEL_ENV: undefined };
    expect(() => withEnv(env, () => databaseTarget(["--apply"]))).toThrow(/Refusing to write to the Production database/);
    expect(() => withEnv(env, () => databaseTarget(["--apply", "--allow-production"]))).toThrow(/Refusing/);
    expect(withEnv({ ...env, CATALOG_CONFIRM_ENDPOINT: prod }, () => databaseTarget(["--apply", "--allow-production"]))).toEqual({ label: prod, isProduction: true });
  });

  it("allows a Preview branch, and refuses an unidentifiable remote database", () => {
    expect(withEnv({ DATABASE_URL: neon("ep-preview-branch-def456"), PRODUCTION_DB_ENDPOINT_ID: prod }, () => databaseTarget([]))).toMatchObject({ isProduction: false });
    expect(() => withEnv({ DATABASE_URL: neon("ep-preview-branch-def456"), PRODUCTION_DB_ENDPOINT_ID: "" }, () => databaseTarget([]))).toThrow(/can't be proven non-Production/);
  });
});
