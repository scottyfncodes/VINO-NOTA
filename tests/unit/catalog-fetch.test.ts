import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { fetchSnapshot, PROPERTIES, queries, sparql, verifyIds } from "../../scripts/catalog/fetch-wikidata";
import { WIKIDATA_CLASSES } from "@/server/reference/wikidata";

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
