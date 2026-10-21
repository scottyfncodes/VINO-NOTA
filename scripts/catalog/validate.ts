/**
 * Read-only quality report for an imported catalog source: counts, provenance,
 * identifiers, duplicates, coverage, and how label readings of well-known wines
 * resolve through the real lookup and enrichment code. Fails (exit 1) only on
 * structural problems: no records, missing provenance, malformed identifiers,
 * or lookups that error. Match rates are reported, not enforced.
 *
 *   npm run catalog:validate -- --source wikidata [--report report.json]
 */
import "dotenv/config";
import { appendFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../../src/server/db";
import { CATALOG_SOURCES } from "../../src/server/reference/sources";
import { lookupCatalog, type LookupInput } from "../../src/server/reference/lookup";
import { enrichFromCatalog, type EnrichableFields } from "../../src/lib/domain/catalog";
import { countryCodeFromName, countryName } from "../../src/lib/domain/countries";
import { arg, databaseTarget } from "./target";

/** Label readings as the recogniser would return them, including a misspelling and an unknown producer. */
export const PROBES: (LookupInput & { label: string })[] = [
  { label: "Bordeaux first growth", producer: "Château Margaux", name: "Château Margaux", country: "France", region: null, appellation: "Margaux" },
  { label: "Misspelled producer", producer: "Chateau Margau", name: null, country: null, region: null, appellation: null },
  { label: "Burgundy grand cru", producer: "Domaine de la Romanée-Conti", name: "Romanée-Conti", country: "France", region: "Burgundy", appellation: null },
  { label: "Australian icon", producer: "Penfolds", name: "Grange", country: "Australia", region: null, appellation: null },
  { label: "Ribera del Duero", producer: "Vega Sicilia", name: "Único", country: "Spain", region: null, appellation: "Ribera del Duero" },
  { label: "Tuscany", producer: "Marchesi Antinori", name: "Tignanello", country: "Italy", region: "Tuscany", appellation: null },
  { label: "Napa", producer: "Robert Mondavi Winery", name: null, country: "United States", region: null, appellation: "Napa Valley" },
  { label: "Appellation only (Barolo)", producer: null, name: null, country: "Italy", region: null, appellation: "Barolo" },
  { label: "Appellation only (Rioja)", producer: null, name: null, country: null, region: "Rioja", appellation: null },
  { label: "Appellation only (Chablis)", producer: null, name: null, country: "France", region: null, appellation: "Chablis" },
  { label: "Region only (Mosel)", producer: null, name: null, country: "Germany", region: "Mosel", appellation: null },
  { label: "Unknown producer", producer: "Totally Unknown Estate", name: "Cuvée Imaginaire", country: null, region: null, appellation: null },
];

const one = async (q: ReturnType<typeof sql>) => {
  const r = (await getDb().execute(q)) as unknown as Record<string, unknown>[];
  return r[0] ?? {};
};

async function main() {
  const argv = process.argv.slice(2);
  const sourceId = arg(argv, "--source") ?? "wikidata";
  if (!(sourceId in CATALOG_SOURCES)) throw new Error(`Unknown source ${sourceId}.`);
  const source = CATALOG_SOURCES[sourceId as keyof typeof CATALOG_SOURCES];
  const target = databaseTarget(argv);
  const problems: string[] = [];

  const sourceRow = await one(sql`SELECT license, attribution, approved_for_lookup, retrieved_at FROM catalog_source WHERE id = ${sourceId}`);
  if (!sourceRow.license) problems.push("source row missing");
  else if (sourceRow.license !== source.license || sourceRow.attribution !== source.attribution) problems.push("source licence/attribution differs from sources.ts");

  const counts: Record<string, number> = {};
  const provenance: Record<string, number> = {};
  for (const table of ["catalog_region", "catalog_producer", "catalog_grape", "catalog_wine"]) {
    const t = sql.raw(table);
    const r = await one(sql`SELECT count(*)::int AS n,
        count(*) FILTER (WHERE external_id !~ '^Q[0-9]+$')::int AS bad_ids,
        count(*) FILTER (WHERE last_verified_at IS NULL)::int AS unverified,
        ${table === "catalog_grape" ? sql`0` : sql`count(*) FILTER (WHERE confidence <> ${source.confidence})`}::int AS off_confidence
      FROM ${t} WHERE source_id = ${sourceId}`);
    counts[table] = Number(r.n);
    provenance[`${table}.bad_ids`] = Number(r.bad_ids);
    provenance[`${table}.unverified`] = Number(r.unverified);
    provenance[`${table}.off_confidence`] = Number(r.off_confidence);
    if (sourceId === "wikidata" && Number(r.bad_ids) > 0) problems.push(`${table}: ${r.bad_ids} malformed Wikidata ids`);
    if (Number(r.unverified) > 0) problems.push(`${table}: ${r.unverified} rows without last_verified_at`);
  }
  if (Object.values(counts).every((n) => n === 0)) problems.push("no records imported");

  const quality = {
    aliases: Number((await one(sql`SELECT count(*)::int AS n FROM catalog_alias WHERE source_id = ${sourceId}`)).n),
    regionsWithCountry: Number((await one(sql`SELECT count(*) FILTER (WHERE country IS NOT NULL)::int AS n FROM catalog_region WHERE source_id = ${sourceId}`)).n),
    regionsWithParent: Number((await one(sql`SELECT count(*) FILTER (WHERE parent_id IS NOT NULL)::int AS n FROM catalog_region WHERE source_id = ${sourceId}`)).n),
    appellations: Number((await one(sql`SELECT count(*) FILTER (WHERE kind = 'appellation')::int AS n FROM catalog_region WHERE source_id = ${sourceId}`)).n),
    producersWithCountry: Number((await one(sql`SELECT count(*) FILTER (WHERE country IS NOT NULL)::int AS n FROM catalog_producer WHERE source_id = ${sourceId}`)).n),
    winesWithProducer: Number((await one(sql`SELECT count(*) FILTER (WHERE producer_id IS NOT NULL)::int AS n FROM catalog_wine WHERE source_id = ${sourceId}`)).n),
    winesWithGrapes: Number((await one(sql`SELECT count(DISTINCT wine_id)::int AS n FROM catalog_wine_grape wg JOIN catalog_wine w ON w.id = wg.wine_id WHERE w.source_id = ${sourceId}`)).n),
    // Same normalised name under different ids: legitimate homonyms or source duplicates; lookups treat them as ambiguous.
    producerNameCollisions: Number((await one(sql`SELECT count(*)::int AS n FROM (SELECT normalized_name FROM catalog_producer WHERE source_id = ${sourceId} GROUP BY normalized_name HAVING count(*) > 1) d`)).n),
    regionNameCollisions: Number((await one(sql`SELECT count(*)::int AS n FROM (SELECT normalized_name FROM catalog_region WHERE source_id = ${sourceId} GROUP BY normalized_name HAVING count(*) > 1) d`)).n),
    // Regions that are their own ancestor. The import breaks loops via the region decisions; any left is a structural problem.
    regionParentLoops: Number(
      (
        await one(sql`WITH RECURSIVE walk(start_id, id, depth) AS (
            SELECT id, parent_id, 1 FROM catalog_region WHERE source_id = ${sourceId} AND parent_id IS NOT NULL
            UNION ALL SELECT w.start_id, r.parent_id, w.depth + 1 FROM walk w JOIN catalog_region r ON r.id = w.id
              WHERE r.parent_id IS NOT NULL AND w.id <> w.start_id AND w.depth < 20)
          SELECT count(DISTINCT start_id)::int AS n FROM walk WHERE id = start_id`)
      ).n,
    ),
  };
  if (quality.regionParentLoops > 0) problems.push(`${quality.regionParentLoops} regions are their own ancestor (parent loop)`);

  const none = { value: null, confidence: 0 };
  const probes = [];
  for (const p of PROBES) {
    const t0 = performance.now();
    let result;
    try {
      result = await lookupCatalog(p);
    } catch (e) {
      problems.push(`lookup threw for "${p.label}": ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const ms = Math.round(performance.now() - t0);
    const reading: EnrichableFields & { vintage: typeof none } = {
      producer: p.producer ? { value: p.producer, confidence: 0.9 } : none,
      name: p.name ? { value: p.name, confidence: 0.9 } : none,
      country: p.country ? { value: p.country, confidence: 0.9 } : none,
      region: p.region ? { value: p.region, confidence: 0.9 } : none,
      appellation: p.appellation ? { value: p.appellation, confidence: 0.9 } : none,
      subregion: none,
      wineType: none,
      grapes: none,
      vintage: none,
    };
    const e = enrichFromCatalog(reading, result.evidence, countryCodeFromName, countryName);
    if (e.fields.vintage !== none) problems.push(`enrichment touched the vintage for "${p.label}"`);
    probes.push({
      probe: p.label,
      ms,
      matches: result.matches.map((m) => `${m.kind}: ${m.name} (${m.score.toFixed(2)})`),
      filled: Object.fromEntries(e.filled.map((f) => [f, e.fields[f].value])),
      conflicts: e.conflicts,
      ambiguousPlace: result.evidence.place?.ambiguous ?? false,
    });
  }

  const report = { source: sourceId, target: target.label, retrievedAt: sourceRow.retrieved_at ?? null, counts, provenance, quality, probes, problems };
  console.log(JSON.stringify(report, null, 2));
  const out = arg(argv, "--report");
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(report));
  if (problems.length) throw new Error(`${problems.length} structural problem(s): ${problems.join("; ")}`);
}

function markdown(r: { counts: Record<string, number>; quality: Record<string, number>; probes: { probe: string; ms: number; matches: string[]; filled: Record<string, unknown>; conflicts: string[] }[]; problems: string[] }) {
  const rows = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `| ${k} | ${v} |`).join("\n");
  const probes = r.probes.map((p) => `| ${p.probe} | ${p.matches.join("; ") || "no match"} | ${Object.entries(p.filled).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : v}`).join(", ") || "none"} | ${p.conflicts.join(", ") || "none"} | ${p.ms} |`).join("\n");
  return `\n## Catalog validation\n\n| Table | Rows |\n|---|---|\n${rows(r.counts)}\n\n| Quality | Value |\n|---|---|\n${rows(r.quality)}\n\n| Probe | Matches | Filled | Conflicts | ms |\n|---|---|---|---|---|\n${probes}\n\n**Problems:** ${r.problems.length ? r.problems.join("; ") : "none"}\n`;
}

if (process.argv[1]?.endsWith("validate.ts")) {
  main()
    .catch((error) => {
      console.error("[catalog:validate] Failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
