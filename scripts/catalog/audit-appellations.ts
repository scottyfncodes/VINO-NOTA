/**
 * Report-only audit: how many fetched wine-producing regions carry an
 * appellation-style designation in their name or aliases (AOC, DOCG, AVA, ...)?
 *
 *   npm run catalog:audit-appellations -- --dir <snapshot dir> [--report <file>]
 *
 * Reads the snapshot's regions.json through the same parser the import uses,
 * so it examines exactly the records an import would see. No database, no
 * network, and nothing in the snapshot is changed: it writes only the report
 * file (if asked) and the GitHub step summary. A heuristic for manual review;
 * it never filters or reclassifies anything.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { regionClasses, WIKIDATA_CLASSES, wikidataToBatch, type SparqlResult } from "../../src/server/reference/wikidata";
import { auditAppellations, type AppellationAudit, type AuditClass, type FlaggedRecord } from "../../src/lib/domain/appellation-audit";
import { arg } from "./target";

const empty: SparqlResult = { head: { vars: [] }, results: { bindings: [] } };

/**
 * The region records exactly as an import of this snapshot would receive them,
 * plus each record's Wikidata classes as review evidence (null for a snapshot
 * fetched before classes were recorded).
 */
export function regionsFromSnapshot(dir: string) {
  const regions = JSON.parse(readFileSync(join(dir, "regions.json"), "utf8")) as SparqlResult;
  const classes = regionClasses(regions);
  return wikidataToBatch({ regions, producers: empty, grapes: empty, wines: empty }).regions.map((r) => ({
    externalId: r.externalId,
    name: r.name,
    aliases: r.aliases,
    classes: classes ? (classes.get(r.externalId) ?? []) : null,
  }));
}

/** Audits a snapshot directory; the class the regions were fetched by is not counted as an "other" class. */
export function auditSnapshot(dir: string) {
  return auditAppellations(regionsFromSnapshot(dir), undefined, { baseClassId: WIKIDATA_CLASSES.wineRegion.id });
}

const cell = (s: string) => s.replace(/\|/g, "\\|");
const classText = (classes: AuditClass[]) => classes.map((c) => (c.label ? `${c.id} ${c.label}` : c.id)).join(", ");

function classCell(f: FlaggedRecord) {
  if (f.review.classReview === "no-class-data") return "(no class data)";
  return `${f.review.classReview === "other-classes" ? "REVIEW: " : ""}${classText(f.classes ?? [])}`;
}

function reviewCell(f: FlaggedRecord) {
  const notes: string[] = [f.review.group];
  if (f.review.namespacePage) notes.push("namespace page");
  if (f.review.sameBaseAs.length) notes.push(`same base name “${f.review.baseName}” as ${f.review.sameBaseAs.join(", ")}`);
  if (f.review.aliasNamesOf.length) notes.push(`alias is the name of ${f.review.aliasNamesOf.join(", ")}`);
  return notes.join("; ");
}

/** Class evidence for review. No class is mapped to a kind here; that is a separate, approved change. */
function classEvidenceMarkdown(a: AppellationAudit, limit: number) {
  const e = a.classEvidence;
  if (!e.available) return [`### Wikidata class evidence`, ``, `Not in this snapshot (fetched before class evidence was recorded). Re-fetch to review classes.`];
  return [
    `### Wikidata class evidence (for review; no class is mapped to a kind)`,
    ``,
    `${e.recordsWithOtherClasses} of ${a.examined} regions have classes beyond ${e.baseClassId ?? "the fetched class"}; ${e.unflaggedWithOtherClasses.length} of them were not flagged by name.`,
    ``,
    `| Class | Label | Regions | Flagged |`,
    `|---|---|---|---|`,
    ...e.byClass.slice(0, limit).map((c) => `| ${c.id} | ${cell(c.label ?? "(no English label)")} | ${c.records} | ${c.flagged} |`),
    ``,
    `| Wikidata ID | Name (not flagged by name) | Wikidata classes (P31) |`,
    `|---|---|---|`,
    ...(e.unflaggedWithOtherClasses.length ? e.unflaggedWithOtherClasses.slice(0, limit).map((r) => `| ${r.externalId} | ${cell(r.name)} | ${cell(classText(r.classes))} |`) : [`| (none) | | |`]),
  ];
}

export function auditMarkdown(a: AppellationAudit, flaggedListLimit = 500) {
  const rules = Object.entries(a.byRule).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  const lines = [
    `## Appellation audit of wine-producing regions (report only)`,
    ``,
    `> ${a.disclaimer}`,
    ``,
    `**${a.flagged} of ${a.examined} regions flagged (${a.percent}%)**: ${a.flaggedByName} by their own name, ${a.flaggedByAliasOnly} only through an alias.`,
    ``,
    `| Rule | Records |`,
    `|---|---|`,
    ...(rules.length ? rules.map(([id, n]) => `| ${id} | ${n} |`) : [`| (none) | 0 |`]),
    ``,
    `Review hints (pointers, not decisions): ${a.review.possibleDuplicates} possible duplicate concepts, ${a.review.aliasConflicts} possible alias mix-ups, ${a.review.namespacePages} Wikimedia namespace pages (rejected by validation).`,
    ``,
    `| Wikidata ID | Name | Matched rules (field: text) | Wikidata classes (P31) | Review |`,
    `|---|---|---|---|---|`,
    ...a.flaggedRecords.slice(0, flaggedListLimit).map((f) => `| ${f.externalId} | ${cell(f.name)} | ${cell(f.matches.map((m) => `${m.rule} (${m.field}: “${m.text}”)`).join("; "))} | ${cell(classCell(f))} | ${cell(reviewCell(f))} |`),
  ];
  if (a.flaggedRecords.length > flaggedListLimit) lines.push(``, `…${a.flaggedRecords.length - flaggedListLimit} more in the JSON report.`);
  lines.push(``, ...classEvidenceMarkdown(a, flaggedListLimit));
  return lines.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const dir = arg(argv, "--dir");
  if (!dir) throw new Error("Usage: --dir <snapshot dir> [--report <file>]");
  const audit = auditSnapshot(dir);
  const report = arg(argv, "--report");
  if (report) writeFileSync(report, JSON.stringify(audit, null, 2));
  const md = auditMarkdown(audit);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error("[catalog:audit-appellations] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
