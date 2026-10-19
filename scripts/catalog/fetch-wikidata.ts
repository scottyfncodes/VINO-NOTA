/**
 * Fetches a Wikidata (CC0) snapshot for the catalog into a directory of SPARQL
 * JSON files plus manifest.json. Read-only against Wikidata; writes no database.
 *
 *   npm run catalog:fetch-wikidata -- --out data/catalog/wikidata/2026-10-19
 *
 * Follows the Wikidata Query Service policy: a descriptive User-Agent, one
 * query at a time with a pause between them, and bounded result sizes. Before
 * any query runs, every class and property id is checked against its expected
 * English label, so a wrong id stops the fetch instead of importing the wrong data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { WIKIDATA_CLASSES } from "../../src/server/reference/wikidata";
import { arg } from "./target";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "VinoNotaCatalog/1.0 (https://github.com/scottyfncodes/vino-nota)";
const PAUSE_MS = 5_000;
const LIMIT = 20_000;
const LANGS = `"en","fr","it","de","es","pt"`;

const PROPERTIES = {
  P17: "country",
  P297: "ISO 3166-1 alpha-2 code",
  P361: "part of",
  P131: "located in the administrative territorial entity",
  P176: "manufacturer",
  P186: "made from material",
  P495: "country of origin",
} as const;

const C = WIKIDATA_CLASSES;
const altLabels = `OPTIONAL { { ?item skos:altLabel ?alt } UNION { ?item rdfs:label ?alt } FILTER(LANG(?alt) IN (${LANGS})) }`;
const enLabel = `?item rdfs:label ?label FILTER(LANG(?label) = "en")`;

const QUERIES = {
  regions: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (SAMPLE(?isoCode) AS ?iso) (SAMPLE(?p) AS ?parent) (SAMPLE(?k) AS ?kind) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  { ?item wdt:P31/wdt:P279* wd:${C.wineRegion.id} . BIND("region" AS ?k) } UNION { ?item wdt:P31/wdt:P279* wd:${C.appellation.id} . BIND("appellation" AS ?k) }
  ${enLabel}
  OPTIONAL { ?item wdt:P17 ?c . ?c wdt:P297 ?isoCode }
  OPTIONAL { ?item wdt:P361 ?p }
  ${altLabels}
} GROUP BY ?item LIMIT ${LIMIT}`,
  producers: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (SAMPLE(?isoCode) AS ?iso) (SAMPLE(?r) AS ?region) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ?item wdt:P31/wdt:P279* wd:${C.winery.id} .
  ${enLabel}
  OPTIONAL { ?item wdt:P17 ?c . ?c wdt:P297 ?isoCode }
  OPTIONAL { ?item wdt:P131 ?r }
  ${altLabels}
} GROUP BY ?item LIMIT ${LIMIT}`,
  grapes: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ?item wdt:P31 wd:${C.grapeVariety.id} .
  ${enLabel}
  ${altLabels}
} GROUP BY ?item LIMIT ${LIMIT}`,
  wines: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (SAMPLE(?pr) AS ?producer) (SAMPLE(?isoCode) AS ?iso) (GROUP_CONCAT(DISTINCT STR(?g); separator="|") AS ?grapes) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ?item wdt:P31 wd:${C.wine.id} .
  ${enLabel}
  OPTIONAL { ?item wdt:P176 ?pr }
  OPTIONAL { ?item wdt:P495 ?c . ?c wdt:P297 ?isoCode }
  OPTIONAL { ?item wdt:P186 ?g . ?g wdt:P31 wd:${C.grapeVariety.id} }
  ${altLabels}
} GROUP BY ?item LIMIT ${LIMIT}`,
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(query: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) return (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || PAUSE_MS * 2 ** (attempt + 1);
      console.log(`[wikidata] ${res.status}; waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Wikidata query failed: HTTP ${res.status}`);
  }
  throw new Error("Wikidata query failed after retries.");
}

async function verifyIds() {
  const ids = [...Object.values(C).map((c) => c.id), ...Object.keys(PROPERTIES)];
  const res = await sparql(`SELECT ?id ?label WHERE { VALUES ?id { ${ids.map((i) => `wd:${i}`).join(" ")} } ?id rdfs:label ?label FILTER(LANG(?label) = "en") }`);
  const labels = new Map(res.results.bindings.map((b) => [b.id.value.split("/").pop()!, b.label.value.toLowerCase()]));
  const expected: [string, string][] = [...Object.values(C).map((c) => [c.id, c.expectLabel] as [string, string]), ...Object.entries(PROPERTIES)];
  const wrong = expected.filter(([id, label]) => labels.get(id) !== label.toLowerCase());
  if (wrong.length) {
    throw new Error(`Wikidata ids don't match their expected labels: ${wrong.map(([id, l]) => `${id} is "${labels.get(id) ?? "?"}", expected "${l}"`).join("; ")}. Fix WIKIDATA_CLASSES before fetching.`);
  }
}

async function main() {
  const out = arg(process.argv.slice(2), "--out");
  if (!out) throw new Error("Usage: --out <directory>");
  await verifyIds();
  mkdirSync(out, { recursive: true });
  const counts: Record<string, number> = {};
  const queryHashes: Record<string, string> = {};
  for (const [name, query] of Object.entries(QUERIES)) {
    await sleep(PAUSE_MS);
    const result = await sparql(query);
    counts[name] = result.results.bindings.length;
    queryHashes[name] = createHash("sha256").update(query).digest("hex").slice(0, 16);
    if (counts[name] >= LIMIT) console.warn(`[wikidata] ${name} hit the ${LIMIT} row limit; the snapshot is truncated.`);
    writeFileSync(join(out, `${name}.json`), JSON.stringify(result));
    console.log(`[wikidata] ${name}: ${counts[name]} rows`);
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ source: "wikidata", license: "CC0-1.0", retrievedAt: new Date().toISOString(), endpoint: ENDPOINT, counts, queryHashes }, null, 2));
}

main().catch((error) => {
  console.error("[wikidata] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
