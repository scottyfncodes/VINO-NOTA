import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { evaluateCandidates, formatReport, gatherCandidates, MIN_ANCHORS, MIN_INSTANCES, resolveClassIds, TARGETS, type Candidate } from "../../scripts/catalog/resolve-wikidata";
import { fetchSnapshot, PROPERTIES, queries } from "../../scripts/catalog/fetch-wikidata";
import { WIKIDATA_CLASSES } from "@/server/reference/wikidata";

const cand = (over: Partial<Candidate>): Candidate => ({ id: "Q1", label: "x", description: null, matchedTerms: [], instances: 0, parents: [], anchorsHit: [], sampleInstances: [], ...over });
const uri = (id: string) => ({ value: `http://www.wikidata.org/entity/${id}` });
const v = (value: string) => ({ value });
const ok = (bindings: Record<string, { value: string }>[]) => new Response(JSON.stringify({ results: { bindings } }), { status: 200 });

/** Answers each SPARQL query from a fake Wikidata, recording every query sent. */
function fakeWikidata(answer: (query: string) => Record<string, { value: string }>[]) {
  const sent: string[] = [];
  return {
    sent,
    deps: {
      fetch: (async (_u: unknown, init?: RequestInit) => {
        const q = new URLSearchParams(String(init!.body)).get("query")!;
        sent.push(q);
        return ok(answer(q));
      }) as typeof fetch,
      sleep: async () => {},
      log: () => {},
    },
  };
}

/** A small Wikidata: a real grape-variety class, a same-named unrelated item, and two competing region classes. */
function world(query: string) {
  if (query.includes("VALUES ?id")) {
    // Label check of configured ids: everything correct except the three known-bad ids.
    const labels: Record<string, string> = { Q10978: "grape", Q1474389: "2005 Mosconi Cup", Q1424287: "Funk D'Void" };
    return [...Object.values(WIKIDATA_CLASSES).map((c) => [c.id, labels[c.id] ?? c.expectLabel]), ...Object.entries(PROPERTIES)].map(([id, label]) => ({ id: uri(id), label: v(label) }));
  }
  const isGrape = query.includes('"grape variety"@en');
  const isRegion = query.includes('"wine region"@en');
  if (query.includes("?matched")) {
    if (isGrape)
      return [
        { item: uri("Q900"), itemLabel: v("grape variety"), desc: v("cultivar of grapevine"), matched: v("grape variety") },
        { item: uri("Q901"), itemLabel: v("Grape Variety"), desc: v("2019 album"), matched: v("grape variety") },
      ];
    if (isRegion)
      return [
        { item: uri("Q800"), itemLabel: v("wine region"), desc: v("region where wine is produced"), matched: v("wine region") },
        { item: uri("Q801"), itemLabel: v("wine-growing region"), desc: v("area of viticulture"), matched: v("wine-growing region") },
      ];
    return []; // appellation: nothing matches
  }
  if (query.includes("COUNT(DISTINCT ?inst)")) return [["Q900", "4200"], ["Q901", "0"], ["Q800", "350"], ["Q801", "120"]].filter(([id]) => query.includes(`wd:${id}`)).map(([id, n]) => ({ item: uri(id), instances: v(n) }));
  if (query.includes("?parentLabel")) return query.includes("wd:Q900") ? [{ item: uri("Q900"), parentLabel: v("cultivar") }] : [];
  if (query.includes("?anchor")) {
    if (query.includes("wd:Q900")) return ["Merlot", "Chardonnay", "Riesling"].map((a) => ({ item: uri("Q900"), anchor: v(a) }));
    if (query.includes("wd:Q800")) return [{ item: uri("Q800"), anchor: v("Bordeaux") }, { item: uri("Q800"), anchor: v("Rioja") }, { item: uri("Q801"), anchor: v("Mosel") }, { item: uri("Q801"), anchor: v("Douro") }];
  }
  if (query.includes("?instLabel")) return query.includes("wd:Q900") ? [{ item: uri("Q900"), instLabel: v("Merlot") }] : [];
  return [];
}

describe("class-ID resolution decisions", () => {
  it("proposes the single candidate backed by anchors and instances", () => {
    const r = evaluateCandidates("grapeVariety", [cand({ id: "Q900", anchorsHit: ["Merlot", "Chardonnay"], instances: 4200 }), cand({ id: "Q901", instances: 0 })]);
    expect(r).toMatchObject({ status: "resolved", proposed: { id: "Q900" } });
    expect(r.candidates.map((c) => c.id)).toEqual(["Q900", "Q901"]);
  });

  it("refuses to choose between several qualifying candidates", () => {
    const r = evaluateCandidates("wineRegion", [cand({ id: "Q800", anchorsHit: ["a", "b", "c"], instances: 350 }), cand({ id: "Q801", anchorsHit: ["d", "e"], instances: 120 })]);
    expect(r.status).toBe("ambiguous");
    expect(r.proposed).toBeNull();
    expect(r.reason).toContain("Q800, Q801");
  });

  it("reports missing candidates and weak evidence as unresolved", () => {
    expect(evaluateCandidates("appellation", [])).toMatchObject({ status: "unresolved", proposed: null });
    // Same name, no wine evidence (e.g. an album or a person called "Appellation").
    const weak = evaluateCandidates("appellation", [cand({ id: "Q5", label: "appellation", anchorsHit: ["Margaux AOC"], instances: 500 }), cand({ id: "Q6", anchorsHit: ["a", "b"], instances: MIN_INSTANCES - 1 })]);
    expect(weak).toMatchObject({ status: "unresolved", proposed: null });
    expect(weak.reason).toContain(`${MIN_ANCHORS} known anchors and ${MIN_INSTANCES} instances`);
  });
});

describe("resolution run against a fake Wikidata", () => {
  it("collects evidence and separates the wine class from a same-named item", async () => {
    const w = fakeWikidata(world);
    const grapes = await gatherCandidates("grapeVariety", w.deps);
    const real = grapes.find((c) => c.id === "Q900")!;
    expect(real).toMatchObject({ label: "grape variety", description: "cultivar of grapevine", instances: 4200, parents: ["cultivar"], anchorsHit: ["Merlot", "Chardonnay", "Riesling"], sampleInstances: ["Merlot"] });
    expect(grapes.find((c) => c.id === "Q901")).toMatchObject({ description: "2019 album", instances: 0, anchorsHit: [] });
  });

  it("reports the wrong configured labels, a resolved, an ambiguous and an unresolved class", async () => {
    const w = fakeWikidata(world);
    const report = await resolveClassIds(w.deps);
    expect(report.configured).toContain('Q10978 is "grape", expected "grape variety"');
    expect(report.configured).toContain('Q1474389 is "2005 mosconi cup"');
    expect(Object.fromEntries(report.results.map((r) => [r.key, [r.status, r.proposed?.id ?? null]]))).toEqual({
      grapeVariety: ["resolved", "Q900"],
      wineRegion: ["ambiguous", null],
      appellation: ["unresolved", null],
    });
    const text = formatReport(report);
    expect(text).toContain("**Proposed: Q900");
    expect(text).toContain("### wineRegion — AMBIGUOUS");
    expect(text).toContain("### appellation — UNRESOLVED");
  });

  it("sends only label-check and class-resolution queries — never a catalog record query", async () => {
    const w = fakeWikidata(world);
    await resolveClassIds(w.deps);
    const ingest = Object.values(queries(5000));
    const kinds = w.sent.map((q) => {
      expect(ingest).not.toContain(q);
      expect(q).not.toMatch(/SAMPLE\(\?label\) AS \?itemLabel/); // the shape of every ingest query
      if (q.includes("VALUES ?id")) return "label-check";
      if (q.includes("?matched")) return "candidates";
      if (q.includes("COUNT(DISTINCT ?inst)")) return "counts";
      if (q.includes("?parentLabel")) return "parents";
      if (q.includes("?anchor")) return "anchors";
      if (q.includes("?instLabel")) return "samples";
      return `unexpected: ${q}`;
    });
    expect(kinds.filter((k) => k.startsWith("unexpected"))).toEqual([]);
    // Every resolution query is bounded: either by explicit ids or a LIMIT.
    for (const q of w.sent.filter((q) => q.includes("?matched") || q.includes("?instLabel"))) expect(q).toMatch(/LIMIT \d+$/);
  });

  it("has no path to files, databases or artifacts", () => {
    const src = readFileSync("scripts/catalog/resolve-wikidata.ts", "utf8");
    expect(src).not.toMatch(/server\/db|reference\/import|writeFileSync|mkdirSync|fetchSnapshot|DATABASE_URL/);
    const wf = readFileSync(".github/workflows/catalog-resolve-ids.yml", "utf8");
    expect(wf).not.toMatch(/upload-artifact|services:|DATABASE_URL|secrets\.|catalog:import|catalog:fetch-wikidata|environment:/);
    expect(wf).toMatch(/permissions:\n  contents: read/);
  });

  it("searches for every target class with anchors", () => {
    for (const t of Object.values(TARGETS)) {
      expect(t.terms.length).toBeGreaterThan(0);
      expect(t.anchors.length).toBeGreaterThanOrEqual(MIN_ANCHORS * 3);
    }
  });
});

describe("ingest pre-fetch label gate (unchanged)", () => {
  it("stops before any data query when a configured id resolves to the wrong entity", async () => {
    const dir = join(mkdtempSync(join(os.tmpdir(), "wd-gate-")), "snap");
    const w = fakeWikidata(world);
    await expect(fetchSnapshot(dir, 100, w.deps)).rejects.toThrow('Q1424287 is "funk d\'void", expected "appellation"');
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toContain("VALUES ?id");
    expect(existsSync(dir)).toBe(false);
  });
});
