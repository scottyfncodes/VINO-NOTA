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
import { wikidataToBatch, type SparqlResult } from "../../src/server/reference/wikidata";
import { auditAppellations, type AppellationAudit } from "../../src/lib/domain/appellation-audit";
import { arg } from "./target";

const empty: SparqlResult = { head: { vars: [] }, results: { bindings: [] } };

/** The region records exactly as an import of this snapshot would receive them. */
export function regionsFromSnapshot(dir: string) {
  const regions = JSON.parse(readFileSync(join(dir, "regions.json"), "utf8")) as SparqlResult;
  return wikidataToBatch({ regions, producers: empty, grapes: empty, wines: empty }).regions.map((r) => ({ externalId: r.externalId, name: r.name, aliases: r.aliases }));
}

export function auditMarkdown(a: AppellationAudit, flaggedListLimit = 500) {
  const cell = (s: string) => s.replace(/\|/g, "\\|");
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
    `| Wikidata ID | Name | Matched rules (field: text) |`,
    `|---|---|---|`,
    ...a.flaggedRecords.slice(0, flaggedListLimit).map((f) => `| ${f.externalId} | ${cell(f.name)} | ${cell(f.matches.map((m) => `${m.rule} (${m.field}: “${m.text}”)`).join("; "))} |`),
  ];
  if (a.flaggedRecords.length > flaggedListLimit) lines.push(``, `…${a.flaggedRecords.length - flaggedListLimit} more in the JSON report.`);
  return lines.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const dir = arg(argv, "--dir");
  if (!dir) throw new Error("Usage: --dir <snapshot dir> [--report <file>]");
  const audit = auditAppellations(regionsFromSnapshot(dir));
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
