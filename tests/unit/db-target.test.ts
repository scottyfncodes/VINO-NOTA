import { describe, expect, it } from "vitest";
import {
  assertPreviewIsolation,
  describeDatabaseUrl,
  PRODUCTION_ENDPOINT_ID,
  PreviewGuardMisconfiguredError,
  PreviewGuardNotConfiguredError,
  migrationPlan,
  pendingMigrations,
  ProductionDatabaseInPreviewError,
  selectDatabaseUrl,
} from "@/server/db/target";

const PROD = "postgresql://u:secret-pw@ep-winter-glade-b7ewqow0-pooler.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require";
const PREVIEW = "postgresql://u:secret-pw@ep-green-wave-b7tysfv5-pooler.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require";
const guard = { PRODUCTION_DB_ENDPOINT_ID: "ep-winter-glade-b7ewqow0" };

describe("describeDatabaseUrl", () => {
  it("extracts the Neon endpoint id from pooled, direct and compute hosts", () => {
    expect(describeDatabaseUrl(PROD).endpointId).toBe("ep-winter-glade-b7ewqow0");
    expect(describeDatabaseUrl(PROD.replace("-pooler", "")).endpointId).toBe("ep-winter-glade-b7ewqow0");
    expect(describeDatabaseUrl(PROD.replace("-pooler", "-r62-pooler")).endpointId).toBe("ep-winter-glade-b7ewqow0");
  });
  it("never includes credentials", () => {
    expect(JSON.stringify(describeDatabaseUrl(PROD))).not.toContain("secret-pw");
  });
  it("handles non-Neon hosts", () => {
    expect(describeDatabaseUrl("postgresql://vino:vino@localhost:5432/vinonota")).toEqual({ endpointId: null, host: "localhost", database: "vinonota" });
  });
});

describe("assertPreviewIsolation", () => {
  it("refuses Production's endpoint in a Preview deployment", () => {
    expect(() => assertPreviewIsolation(PROD, { VERCEL_ENV: "preview", ...guard })).toThrow(ProductionDatabaseInPreviewError);
  });
  it("matches the production endpoint case-insensitively", () => {
    expect(() => assertPreviewIsolation(PROD, { VERCEL_ENV: "preview", PRODUCTION_DB_ENDPOINT_ID: " EP-WINTER-GLADE-B7EWQOW0 " })).toThrow(ProductionDatabaseInPreviewError);
  });
  it("allows a Preview branch endpoint", () => {
    expect(assertPreviewIsolation(PREVIEW, { VERCEL_ENV: "preview", ...guard }).endpointId).toBe("ep-green-wave-b7tysfv5");
  });
  it("fails closed when the guard is not configured for Preview", () => {
    expect(() => assertPreviewIsolation(PREVIEW, { VERCEL_ENV: "preview" })).toThrow(PreviewGuardNotConfiguredError);
  });
  it("pins the verified Production endpoint", () => {
    expect(PRODUCTION_ENDPOINT_ID).toBe("ep-winter-glade-b7ewqow0");
  });
  it("fails closed when the guard variable names a different endpoint", () => {
    // A wrong value (e.g. another project's endpoint) would otherwise let a Preview fall back to Production.
    const wrong = { VERCEL_ENV: "preview", PRODUCTION_DB_ENDPOINT_ID: "ep-other-project-xyz789" };
    expect(() => assertPreviewIsolation(PROD, wrong)).toThrow(PreviewGuardMisconfiguredError);
    expect(() => assertPreviewIsolation(PREVIEW, wrong)).toThrow(PreviewGuardMisconfiguredError);
  });
  it("refuses an unrecognisable host in Preview", () => {
    expect(() => assertPreviewIsolation("postgresql://u:p@db.example.com/x", { VERCEL_ENV: "preview", ...guard })).toThrow(ProductionDatabaseInPreviewError);
  });
  it("does not restrict Production or local development", () => {
    expect(assertPreviewIsolation(PROD, { VERCEL_ENV: "production", ...guard }).endpointId).toBe("ep-winter-glade-b7ewqow0");
    expect(assertPreviewIsolation(PROD, {}).endpointId).toBe("ep-winter-glade-b7ewqow0");
  });
  it("rejects malformed URLs without echoing them", () => {
    expect(() => assertPreviewIsolation("not a url secret-pw", {})).toThrow(/not a valid connection URL/);
    try {
      assertPreviewIsolation("not a url secret-pw", {});
    } catch (e) {
      expect((e as Error).message).not.toContain("secret-pw");
    }
  });
});

describe("selectDatabaseUrl", () => {
  const UAT = "postgresql://u:uat-secret@ep-bitter-silence-b7b2e3ug-pooler.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require";

  it("uses CATALOG_UAT_DATABASE_URL on a Preview deployment when it is set", () => {
    expect(selectDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PREVIEW, CATALOG_UAT_DATABASE_URL: UAT })).toEqual({ url: UAT, source: "CATALOG_UAT_DATABASE_URL" });
  });

  it("falls back to DATABASE_URL on a Preview without the override (or with a blank one)", () => {
    expect(selectDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PREVIEW })).toEqual({ url: PREVIEW, source: "DATABASE_URL" });
    expect(selectDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: PREVIEW, CATALOG_UAT_DATABASE_URL: "  " })).toEqual({ url: PREVIEW, source: "DATABASE_URL" });
  });

  it("never selects the override in Production, development or anywhere outside a Vercel Preview", () => {
    for (const VERCEL_ENV of ["production", "development", undefined, "Preview", "preview "]) {
      expect(selectDatabaseUrl({ VERCEL_ENV, DATABASE_URL: PROD, CATALOG_UAT_DATABASE_URL: UAT }), String(VERCEL_ENV)).toEqual({ url: PROD, source: "DATABASE_URL" });
    }
  });

  it("returns null when nothing is configured, even if only the override is set outside Preview", () => {
    expect(selectDatabaseUrl({})).toBeNull();
    expect(selectDatabaseUrl({ VERCEL_ENV: "production", CATALOG_UAT_DATABASE_URL: UAT })).toBeNull();
  });

  it("keeps the Production guard: an override pointing at Production is still refused on Preview", () => {
    const env = { VERCEL_ENV: "preview", DATABASE_URL: PREVIEW, CATALOG_UAT_DATABASE_URL: PROD, ...guard };
    const selected = selectDatabaseUrl(env)!;
    expect(selected.source).toBe("CATALOG_UAT_DATABASE_URL");
    expect(() => assertPreviewIsolation(selected.url, env)).toThrow(ProductionDatabaseInPreviewError);
    // The UAT endpoint itself passes, and nothing loggable carries the credentials.
    expect(assertPreviewIsolation(UAT, { ...env, CATALOG_UAT_DATABASE_URL: UAT })).toMatchObject({ endpointId: "ep-bitter-silence-b7b2e3ug" });
    expect(JSON.stringify(assertPreviewIsolation(UAT, { ...env, CATALOG_UAT_DATABASE_URL: UAT }))).not.toContain("uat-secret");
  });
});

describe("migrationPlan", () => {
  const prod = describeDatabaseUrl(PROD);
  const preview = describeDatabaseUrl(PREVIEW);
  const local = describeDatabaseUrl("postgresql://vino:vino@localhost:5432/vinonota");
  const confirmed = { MIGRATION_CONFIRM_ENDPOINT: PRODUCTION_ENDPOINT_ID };

  it("never migrates from a Production build, even with the override flags", () => {
    for (const target of [prod, preview, local]) {
      expect(migrationPlan(target, { VERCEL: "1", VERCEL_ENV: "production", ...confirmed }, ["--allow-production"]).action).toBe("check");
    }
    // A Production endpoint reached from any Vercel build is check-only too.
    expect(migrationPlan(prod, { VERCEL: "1", VERCEL_ENV: "preview" }, []).action).toBe("check");
  });

  it("lets Preview builds, CI and local runs migrate their own databases", () => {
    expect(migrationPlan(preview, { VERCEL: "1", VERCEL_ENV: "preview" }, [])).toEqual({ action: "migrate" });
    expect(migrationPlan(local, {}, [])).toEqual({ action: "migrate" });
    expect(migrationPlan(local, {}, ["--check"]).action).toBe("check");
  });

  it("refuses Production outside a build unless both --allow-production and the typed endpoint are given", () => {
    expect(migrationPlan(prod, {}, []).action).toBe("refuse");
    expect(migrationPlan(prod, {}, ["--allow-production"]).action).toBe("refuse");
    expect(migrationPlan(prod, confirmed, []).action).toBe("refuse");
    expect(migrationPlan(prod, { MIGRATION_CONFIRM_ENDPOINT: "ep-other-endpoint-b7aaaaaa" }, ["--allow-production"]).action).toBe("refuse");
    expect(migrationPlan(prod, confirmed, ["--allow-production"])).toEqual({ action: "migrate" });
    // Checking Production is read-only and always allowed.
    expect(migrationPlan(prod, {}, ["--check"]).action).toBe("check");
  });
});

describe("pendingMigrations", () => {
  const journal = [
    { tag: "0000_initial", when: 100 },
    { tag: "0001_catalog", when: 200 },
    { tag: "0002_next", when: 300 },
  ];
  it("lists entries newer than the last applied one, like drizzle's migrator", () => {
    expect(pendingMigrations(journal, null)).toEqual(["0000_initial", "0001_catalog", "0002_next"]);
    expect(pendingMigrations(journal, 200)).toEqual(["0002_next"]);
    expect(pendingMigrations(journal, 300)).toEqual([]);
  });
});
