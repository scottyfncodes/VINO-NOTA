/**
 * Imports a fetched source snapshot into the catalog.
 *
 *   npm run catalog:import -- --source wikidata --dir data/catalog/wikidata/2026-10-19            (dry run)
 *   npm run catalog:import -- --source wikidata --dir data/catalog/wikidata/2026-10-19 --apply
 *
 * Options: --report <file> writes the full report (with every rejection);
 * --expect-unchanged fails if anything would change (idempotency check);
 * --only regions,grapes limits the import to those record types and leaves
 * every other type (rows and aliases) untouched.
 *
 * Dry run is the default: the whole import runs in a transaction that is then
 * rolled back, and the report shows what would change. Re-running a snapshot
 * changes nothing (idempotent). Failure rolls back everything; fix and re-run.
 * Records missing from a newer snapshot are reported as stale, never deleted.
 *
 * Wikidata regions pass through the reviewed region decisions
 * (src/server/reference/region-decisions.ts) first: kinds, cleared parents,
 * dropped aliases and exclusions. The report lists what they changed.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_SOURCES } from "../../src/server/reference/sources";
import { wikidataToBatch, type WikidataFiles } from "../../src/server/reference/wikidata";
import { openFoodFactsToBatch } from "../../src/server/reference/openfoodfacts";
import { IMPORT_KINDS, importCatalogBatch } from "../../src/server/reference/import";
import { applyRegionDecisions } from "../../src/server/reference/region-decisions";
import { closeDb } from "../../src/server/db";
import { arg, databaseTarget } from "./target";

const MAX_OFF_BYTES = 200 * 1024 * 1024;

async function main() {
  const argv = process.argv.slice(2);
  const sourceId = arg(argv, "--source");
  const dir = arg(argv, "--dir");
  const apply = argv.includes("--apply");
  if (!dir || (sourceId !== "wikidata" && sourceId !== "openfoodfacts")) {
    throw new Error("Usage: --source wikidata|openfoodfacts --dir <snapshot dir> [--apply]");
  }
  const source = CATALOG_SOURCES[sourceId];
  if (apply && !source.approvedForLookup && !argv.includes("--allow-unapproved")) {
    throw new Error(`${source.name} is not approved (see docs/catalog-sources.md). Importing it needs --allow-unapproved after a licensing decision.`);
  }
  const onlyArg = arg(argv, "--only");
  const only = onlyArg?.split(",").map((k) => k.trim()).filter(Boolean);
  const unknown = only?.filter((k) => !(IMPORT_KINDS as readonly string[]).includes(k)) ?? [];
  if (unknown.length || (only && !only.length)) throw new Error(`--only takes a comma-separated list of: ${IMPORT_KINDS.join(", ")}.`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { source: string; retrievedAt: string };
  if (manifest.source !== sourceId) throw new Error(`Snapshot is for ${manifest.source}, not ${sourceId}.`);
  const retrievedAt = new Date(manifest.retrievedAt);
  if (Number.isNaN(retrievedAt.getTime())) throw new Error("manifest.json has no valid retrievedAt.");

  let batch;
  const notes: Record<string, number> = {};
  let decisions: Omit<ReturnType<typeof applyRegionDecisions>, "regions"> | null = null;
  if (sourceId === "wikidata") {
    const read = (f: string) => JSON.parse(readFileSync(join(dir, `${f}.json`), "utf8"));
    batch = wikidataToBatch({ regions: read("regions"), producers: read("producers"), grapes: read("grapes"), wines: read("wines") } as WikidataFiles);
    const { regions, ...applied } = applyRegionDecisions(batch.regions);
    batch = { ...batch, regions };
    decisions = applied;
  } else {
    const raw = readFileSync(join(dir, "products.jsonl"));
    if (raw.length > MAX_OFF_BYTES) throw new Error("products.jsonl is larger than 200 MB; pre-filter it to wines first (see docs/catalog.md).");
    const parsed = openFoodFactsToBatch(raw.toString("utf8").split("\n"));
    batch = parsed.batch;
    notes.malformedLines = parsed.malformed;
    notes.skippedNotWine = parsed.skippedNotWine;
  }

  const target = databaseTarget(argv);
  console.log(`[catalog:import] source=${sourceId} target=${target.label} mode=${apply ? "apply" : "dry-run"} scope=${only?.join(",") ?? "all"} retrievedAt=${manifest.retrievedAt}`);
  const report = await importCatalogBatch(source, batch, { dryRun: !apply, retrievedAt, only: only as (typeof IMPORT_KINDS)[number][] | undefined });
  const { rejected, ...counts } = report;
  const summary = {
    ...counts,
    ...notes,
    target: target.label,
    retrievedAt: manifest.retrievedAt,
    rejectedCount: rejected.length,
    rejectedSample: rejected.slice(0, 20),
    ...(decisions && { regionDecisions: { changed: decisions.changed, excluded: decisions.excluded, parentsCleared: decisions.parentsCleared } }),
  };
  console.log(JSON.stringify(summary, null, 2));
  const reportFile = arg(argv, "--report");
  if (reportFile) writeFileSync(reportFile, JSON.stringify({ ...summary, rejected }, null, 2));
  // Idempotency check: re-importing the same snapshot must change nothing.
  if (argv.includes("--expect-unchanged")) {
    const kinds = [report.regions, report.producers, report.grapes, report.wines, report.products];
    const changed = kinds.reduce((n, k) => n + k.inserted + k.updated, 0) + report.aliases.added + report.aliases.removed;
    if (changed > 0) throw new Error(`Expected no changes on re-import, but ${changed} rows/aliases changed.`);
    console.log("[catalog:import] Re-import changed nothing (idempotent).");
  }
}

main()
  .catch((error) => {
    console.error("[catalog:import] Failed, nothing was written:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
