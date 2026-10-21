/**
 * Read-only check of the database a catalog job is about to use. Proves which
 * endpoint DATABASE_URL points at, and that it holds what we expect, before any
 * migration or import runs. Prints counts and the endpoint id only, never
 * credentials or row contents. Every query runs in a READ ONLY transaction.
 *
 *   npm run catalog:inspect-target -- --expect-endpoint ep-purple-hat-b7y33lux [--expect-no-users]
 *
 * Fails when the endpoint differs from --expect-endpoint, or (with
 * --expect-no-users) when the database holds any account, i.e. it is a copy
 * of real user data rather than a schema-only branch.
 */
import "dotenv/config";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { arg, databaseTarget } from "./target";

const TABLES = ["user", "session", "account", "catalog_source", "catalog_region", "catalog_grape", "catalog_producer", "catalog_wine", "catalog_alias"] as const;

/** Checks a target's identity and contents; returns the problems found. */
export function targetProblems(label: string, counts: Record<string, number>, opts: { expectEndpoint?: string; expectNoUsers: boolean }) {
  const problems: string[] = [];
  if (!opts.expectEndpoint) problems.push("--expect-endpoint is required");
  else if (label !== opts.expectEndpoint) problems.push(`DATABASE_URL points at ${label}, not ${opts.expectEndpoint}`);
  if (opts.expectNoUsers && (counts.user ?? 0) + (counts.session ?? 0) + (counts.account ?? 0) > 0) problems.push("the database holds user accounts or sessions; expected a schema-only branch");
  return problems;
}

async function main() {
  const argv = process.argv.slice(2);
  const { label } = databaseTarget(argv);
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const result = await sql.begin("read only", async (tx) => {
      const [db] = await tx`select current_database() as name`;
      const [migrations] = await tx`select count(*)::int as n from drizzle.__drizzle_migrations`;
      const counts: Record<string, number> = {};
      for (const t of TABLES) counts[t] = (await tx`select count(*)::int as n from ${tx(t)}`)[0].n;
      return { database: db.name as string, migrations: migrations.n as number, counts };
    });
    const problems = targetProblems(label, result.counts, { expectEndpoint: arg(argv, "--expect-endpoint"), expectNoUsers: argv.includes("--expect-no-users") });
    const report = { endpoint: label, ...result, problems };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## Catalog target (read only)\n\nEndpoint \`${label}\`, database \`${result.database}\`, ${result.migrations} migrations recorded.\n\n| Table | Rows |\n|---|---|\n${Object.entries(result.counts).map(([t, n]) => `| ${t} | ${n} |`).join("\n")}\n\n**Problems:** ${problems.length ? problems.join("; ") : "none"}\n`);
    }
    if (problems.length) throw new Error(problems.join("; "));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[catalog:inspect-target] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
