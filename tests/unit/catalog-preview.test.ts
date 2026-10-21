import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { targetProblems } from "../../scripts/catalog/inspect-target";

const empty = { user: 0, session: 0, account: 0, catalog_region: 0 };

describe("catalog target inspection", () => {
  it("passes only when the secret points at the expected endpoint", () => {
    expect(targetProblems("ep-purple-hat-b7y33lux", empty, { expectEndpoint: "ep-purple-hat-b7y33lux", expectNoUsers: true })).toEqual([]);
    expect(targetProblems("ep-other-name-abc123", empty, { expectEndpoint: "ep-purple-hat-b7y33lux", expectNoUsers: true })).toEqual(["DATABASE_URL points at ep-other-name-abc123, not ep-purple-hat-b7y33lux"]);
    expect(targetProblems("ep-purple-hat-b7y33lux", empty, { expectNoUsers: false })).toEqual(["--expect-endpoint is required"]);
  });
  it("fails on any copied account or session when a schema-only branch is expected", () => {
    expect(targetProblems("ep-purple-hat-b7y33lux", { ...empty, user: 2 }, { expectEndpoint: "ep-purple-hat-b7y33lux", expectNoUsers: true })).toEqual([
      "the database holds user accounts or sessions; expected a schema-only branch",
    ]);
    expect(targetProblems("ep-purple-hat-b7y33lux", { ...empty, session: 1 }, { expectEndpoint: "ep-purple-hat-b7y33lux", expectNoUsers: false })).toEqual([]);
  });
  it("is read only", () => {
    const src = readFileSync("scripts/catalog/inspect-target.ts", "utf8");
    expect(src).toContain('sql.begin("read only"');
    expect(src).not.toMatch(/\b(insert|update|delete|drop|alter|truncate|create)\b\s/i);
    expect(src).not.toMatch(/reference\/import|migrate/);
  });
});

describe("Preview job in the ingest workflow", () => {
  const wf = readFileSync(".github/workflows/catalog-ingest.yml", "utf8");
  const job = wf.slice(wf.indexOf("  import-preview:"));
  const step = (name: string) => job.indexOf(name);

  it("defaults to a read-only verify run, scoped to regions and grapes", () => {
    expect(wf).toMatch(/preview_mode:\n(?:.*\n){2}\s+options: \[verify, dry-run, import\]\n\s+default: verify/);
    expect(wf).toMatch(/preview_record_types:\n(?:.*\n){2}\s+default: "regions,grapes"/);
  });

  it("proves the target before any migration or write, and refuses a Production endpoint id", () => {
    expect(job).toContain('--expect-endpoint "$EXPECTED_ENDPOINT" --expect-no-users');
    expect(job).toContain('[ "$EXPECTED_ENDPOINT" != "$PRODUCTION_DB_ENDPOINT_ID" ]');
    const prove = step("Prove the target");
    expect(prove).toBeGreaterThan(0);
    for (const later of ["Migrate Preview database", "Dry run against Preview", "Import into Preview", "Validate Preview"]) expect(step(later)).toBeGreaterThan(prove);
  });

  it("migrates and dry-runs only outside verify, and applies only in import mode", () => {
    const ifFor = (name: string) => job.slice(step(name)).split("\n")[1];
    expect(ifFor("Migrate Preview database")).toContain("env.MODE != 'verify'");
    expect(ifFor("Dry run against Preview")).toContain("env.MODE != 'verify'");
    for (const name of ["Import into Preview", "Re-import into Preview", "Validate Preview"]) expect(ifFor(name)).toContain("env.MODE == 'import'");
    expect(step("Dry run against Preview")).toBeLessThan(step("Import into Preview"));
    for (const name of ["Dry run against Preview", "Import into Preview", "Re-import into Preview"]) expect(job.slice(step(name)).split("\n")[2]).toContain('--only "$ONLY"');
  });
});
