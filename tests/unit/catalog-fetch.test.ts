import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { fetchSnapshot, PROPERTIES, queries, sparql, verifyIds } from "../../scripts/catalog/fetch-wikidata";
import { EXCLUDED_WIKIDATA_CLASSES, WIKIDATA_CLASSES, wikidataToBatch } from "@/server/reference/wikidata";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const empty = { results: { bindings: [] } };

function deps(responses: (Response | Error)[]) {
  const sleeps: number[] = [];
  const calls: RequestInit[] = [];
  return {
    sleeps,
    calls,
    deps: {
      fetch: (async (_url: unknown, init?: RequestInit) => {
        calls.push(init!);
        const next = responses.shift();
        if (!next) throw new Error("no more responses");
        if (next instanceof Error) throw next;
        return next;
      }) as typeof fetch,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      log: () => {},
    },
  };
}

const labelsResponse = (override: Record<string, string> = {}) =>
  json({
    results: {
      bindings: [...Object.values(WIKIDATA_CLASSES).map((c) => [c.id, c.expectLabel]), ...Object.entries(PROPERTIES)].map(([id, label]) => ({
        id: { value: `http://www.wikidata.org/entity/${id}` },
        label: { value: override[id] ?? label },
      })),
    },
  });

describe("Wikidata fetch", () => {
  it("retries 429, 5xx and network errors with bounded back-off, honouring Retry-After", async () => {
    const d = deps([json({}, 429, { "retry-after": "7" }), json({}, 503), new TypeError("fetch failed"), json(empty)]);
    await expect(sparql("SELECT 1", d.deps)).resolves.toEqual(empty);
    expect(d.sleeps).toEqual([7000, 20000, 40000]);
  });

  it("gives up after four attempts and fails at once on a client error", async () => {
    const d = deps([json({}, 500), json({}, 500), json({}, 500), json({}, 500)]);
    await expect(sparql("SELECT 1", d.deps)).rejects.toThrow("after 4 attempts (HTTP 500)");
    const bad = deps([json({}, 400)]);
    await expect(sparql("SELECT 1", bad.deps)).rejects.toThrow("HTTP 400");
    expect(bad.sleeps).toEqual([]);
  });

  it("caps an excessive Retry-After", async () => {
    const d = deps([json({}, 429, { "retry-after": "86400" }), json(empty)]);
    await sparql("SELECT 1", d.deps);
    expect(d.sleeps).toEqual([120000]);
  });

  it("identifies itself without personal data", async () => {
    const d = deps([json(empty)]);
    await sparql("SELECT 1", d.deps);
    const ua = (d.calls[0].headers as Record<string, string>)["User-Agent"];
    expect(ua).toMatch(/^VinoNotaCatalog\/1\.0 \(https:\/\/github\.com\//);
    expect(ua).not.toMatch(/@/);
  });

  it("stops before fetching data when an id no longer has its expected label", async () => {
    const d = deps([labelsResponse({ Q282: "something else" })]);
    await expect(verifyIds(d.deps)).rejects.toThrow('Q282 is "something else", expected "wine"');
  });

  it("writes every query result and a provenance manifest, flagging truncation", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "wd-"));
    const full = { results: { bindings: [{ item: { value: "x" } }, { item: { value: "y" } }] } };
    const d = deps([labelsResponse(), json(full), json(empty), json(empty), json(empty)]);
    const manifest = await fetchSnapshot(dir, 2, d.deps);
    expect(manifest).toMatchObject({ source: "wikidata", license: "CC0-1.0", limit: 2, counts: { regions: 2, producers: 0, grapes: 0, wines: 0 }, truncated: ["regions"] });
    expect(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).queryHashes.regions).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.parse(readFileSync(join(dir, "regions.json"), "utf8"))).toEqual(full);
    // One query at a time, with a pause before each.
    expect(d.sleeps).toEqual([5000, 5000, 5000, 5000]);
  });

  it("bounds every query", () => {
    for (const q of Object.values(queries(1234))) expect(q).toMatch(/LIMIT 1234$/);
  });
});

describe("configured Wikidata classes", () => {
  it("uses the verified grape-variety and wine-producing-region ids with their exact labels", () => {
    expect(WIKIDATA_CLASSES.grapeVariety).toEqual({ id: "Q958314", expectLabel: "grape variety" });
    expect(WIKIDATA_CLASSES.wineRegion).toMatchObject({ id: "Q2140699", expectLabel: "wine-producing region", kind: "region" });
    // The ids that resolved to "grape", "2005 Mosconi Cup" and "Funk D'Void" are gone.
    const ids = Object.values(WIKIDATA_CLASSES).map((c) => c.id);
    for (const old of ["Q10978", "Q1474389", "Q1424287"]) {
      expect(ids).not.toContain(old);
      for (const q of Object.values(queries(100))) expect(q).not.toContain(`wd:${old}`);
    }
  });

  it("excludes appellations from ingestion", () => {
    expect(Object.keys(WIKIDATA_CLASSES)).not.toContain("appellation");
    expect(EXCLUDED_WIKIDATA_CLASSES).toEqual(["appellation"]);
    const q = queries(100);
    expect(q.regions).toContain(`?item wdt:P31 wd:${WIKIDATA_CLASSES.wineRegion.id} .`);
    // Direct instances only: a subclass walk would pull in appellation systems such as AVAs.
    expect(q.regions).not.toContain("P279*");
    expect(q.regions).not.toMatch(/appellation/i);
    expect(q.grapes).toContain(`wd:${WIKIDATA_CLASSES.grapeVariety.id}`);
    expect(q.wines).toContain(`wd:${WIKIDATA_CLASSES.grapeVariety.id}`);
    // Without a kind binding every fetched place is imported as a region.
    const batch = wikidataToBatch({
      regions: { head: { vars: [] }, results: { bindings: [{ item: { type: "uri", value: "http://www.wikidata.org/entity/Q1" }, itemLabel: { type: "literal", value: "Rioja" }, iso: { type: "literal", value: "ES" } }] } },
      producers: { head: { vars: [] }, results: { bindings: [] } },
      grapes: { head: { vars: [] }, results: { bindings: [] } },
      wines: { head: { vars: [] }, results: { bindings: [] } },
    });
    expect(batch.regions.map((r) => r.kind)).toEqual(["region"]);
  });

  it("checks every configured class and property before fetching, and fails closed on any mismatch", async () => {
    const ok = deps([labelsResponse()]);
    const verified = await verifyIds(ok.deps);
    expect(Object.keys(verified).sort()).toEqual([...Object.values(WIKIDATA_CLASSES).map((c) => c.id), ...Object.keys(PROPERTIES)].sort());
    for (const id of ["Q958314", "Q2140699"]) {
      const bad = deps([labelsResponse({ [id]: "something else" })]);
      await expect(verifyIds(bad.deps)).rejects.toThrow(`${id} is "something else"`);
    }
    // A missing label (id deleted or merged on Wikidata) also stops the fetch.
    const missing = deps([json({ results: { bindings: [] } })]);
    await expect(verifyIds(missing.deps)).rejects.toThrow("don't match their expected labels");
  });
});
