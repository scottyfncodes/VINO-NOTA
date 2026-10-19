/**
 * Fetches a Wikidata (CC0) snapshot for the catalog into a directory of SPARQL
 * JSON files plus manifest.json. Read-only against Wikidata; writes no database.
 *
 *   npm run catalog:fetch-wikidata -- --out data/catalog/wikidata/2026-10-19 [--limit 5000]
 *
 * Follows the Wikidata Query Service policy: a descriptive User-Agent, one
 * query at a time with a pause between them, bounded result sizes, and
 * back-off on 429/5xx. Before any query runs, every class and property id is
 * checked against its expected English label, so a wrong id stops the fetch
 * instead of importing the wrong data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { WIKIDATA_CLASSES } from "../../src/server/reference/wikidata";
import { arg } from "./target";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "VinoNotaCatalog/1.0 (https://github.com/scottyfncodes/vino-nota)";
const PAUSE_MS = 5_000;
export const DEFAULT_LIMIT = 20_000;
export const MAX_LIMIT = 50_000;
const MAX_ATTEMPTS = 4;
const MAX_WAIT_MS = 120_000;
const LANGS = `"en","fr","it","de","es","pt"`;

export const PROPERTIES = {
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

export function queries(limit: number) {
  return {
    regions: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (SAMPLE(?isoCode) AS ?iso) (SAMPLE(?p) AS ?parent) (SAMPLE(?k) AS ?kind) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  { ?item wdt:P31/wdt:P279* wd:${C.wineRegion.id} . BIND("region" AS ?k) } UNION { ?item wdt:P31/wdt:P279* wd:${C.appellation.id} . BIND("appellation" AS ?k) }
  ${enLabel}
  OPTIONAL { ?item wdt:P17 ?c . ?c wdt:P297 ?isoCode }
  OPTIONAL { ?item wdt:P361 ?p }
  ${altLabels}
} GROUP BY ?item LIMIT ${limit}`,
    producers: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (SAMPLE(?isoCode) AS ?iso) (SAMPLE(?r) AS ?region) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ?item wdt:P31/wdt:P279* wd:${C.winery.id} .
  ${enLabel}
  OPTIONAL { ?item wdt:P17 ?c . ?c wdt:P297 ?isoCode }
  OPTIONAL { ?item wdt:P131 ?r }
  ${altLabels}
} GROUP BY ?item LIMIT ${limit}`,
    grapes: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ?item wdt:P31 wd:${C.grapeVariety.id} .
  ${enLabel}
  ${altLabels}
} GROUP BY ?item LIMIT ${limit}`,
    wines: `SELECT ?item (SAMPLE(?label) AS ?itemLabel) (SAMPLE(?pr) AS ?producer) (SAMPLE(?isoCode) AS ?iso) (GROUP_CONCAT(DISTINCT STR(?g); separator="|") AS ?grapes) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
  ?item wdt:P31 wd:${C.wine.id} .
  ${enLabel}
  OPTIONAL { ?item wdt:P176 ?pr }
  OPTIONAL { ?item wdt:P495 ?c . ?c wdt:P297 ?isoCode }
  OPTIONAL { ?item wdt:P186 ?g . ?g wdt:P31 wd:${C.grapeVariety.id} }
  ${altLabels}
} GROUP BY ?item LIMIT ${limit}`,
  } as const;
}

type Bindings = { results: { bindings: Record<string, { value: string }>[] } };
export type Deps = { fetch: typeof fetch; sleep: (ms: number) => Promise<void>; log: (msg: string) => void };
export const defaultDeps: Deps = { fetch: (...a) => fetch(...a), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: (m) => console.log(m) };

/**
 * One SPARQL query with bounded retries: 429, 5xx, timeouts and network errors
 * back off (honouring Retry-After, capped) and retry; other HTTP errors fail at once.
 */
export async function sparql(query: string, deps: Deps = defaultDeps): Promise<Bindings> {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let wait = Math.min(PAUSE_MS * 2 ** attempt, MAX_WAIT_MS);
    try {
      const res = await deps.fetch(ENDPOINT, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) return (await res.json()) as Bindings;
      if (res.status !== 429 && res.status < 500) throw new FatalHttpError(res.status);
      const retryAfter = Number(res.headers.get("retry-after"));
      if (retryAfter > 0) wait = Math.min(retryAfter * 1000, MAX_WAIT_MS);
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      if (e instanceof FatalHttpError) throw new Error(`Wikidata query failed: HTTP ${e.status}`);
      lastError = e instanceof Error ? e.name : "network error";
    }
    if (attempt < MAX_ATTEMPTS) {
      deps.log(`[wikidata] attempt ${attempt} failed (${lastError}); retrying in ${Math.round(wait / 1000)}s`);
      await deps.sleep(wait);
    }
  }
  throw new Error(`Wikidata query failed after ${MAX_ATTEMPTS} attempts (${lastError}).`);
}

class FatalHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** Throws unless every class and property id still has its expected English label. */
export async function verifyIds(deps: Deps = defaultDeps) {
  const expected: [string, string][] = [...Object.values(C).map((c) => [c.id, c.expectLabel] as [string, string]), ...Object.entries(PROPERTIES)];
  const res = await sparql(`SELECT ?id ?label WHERE { VALUES ?id { ${expected.map(([id]) => `wd:${id}`).join(" ")} } ?id rdfs:label ?label FILTER(LANG(?label) = "en") }`, deps);
  const labels = new Map(res.results.bindings.map((b) => [b.id.value.split("/").pop()!, b.label.value.toLowerCase()]));
  const wrong = expected.filter(([id, label]) => labels.get(id) !== label.toLowerCase());
  if (wrong.length) {
    throw new Error(`Wikidata ids don't match their expected labels: ${wrong.map(([id, l]) => `${id} is "${labels.get(id) ?? "?"}", expected "${l}"`).join("; ")}. Fix WIKIDATA_CLASSES before fetching.`);
  }
  return Object.fromEntries(labels);
}

export async function fetchSnapshot(out: string, limit: number, deps: Deps = defaultDeps) {
  const verified = await verifyIds(deps);
  mkdirSync(out, { recursive: true });
  const counts: Record<string, number> = {};
  const truncated: string[] = [];
  const queryHashes: Record<string, string> = {};
  for (const [name, query] of Object.entries(queries(limit))) {
    await deps.sleep(PAUSE_MS);
    const result = await sparql(query, deps);
    counts[name] = result.results.bindings.length;
    queryHashes[name] = createHash("sha256").update(query).digest("hex").slice(0, 16);
    if (counts[name] >= limit) truncated.push(name);
    writeFileSync(join(out, `${name}.json`), JSON.stringify(result));
    deps.log(`[wikidata] ${name}: ${counts[name]} rows${counts[name] >= limit ? " (hit the limit; truncated)" : ""}`);
  }
  const manifest = { source: "wikidata", license: "CC0-1.0", retrievedAt: new Date().toISOString(), endpoint: ENDPOINT, userAgent: USER_AGENT, limit, counts, truncated, queryHashes, verifiedIds: verified };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function main() {
  const argv = process.argv.slice(2);
  const out = arg(argv, "--out");
  if (!out) throw new Error("Usage: --out <directory> [--limit N]");
  const limit = Number(arg(argv, "--limit") ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}.`);
  await fetchSnapshot(out, limit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[wikidata] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
