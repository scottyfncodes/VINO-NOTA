/**
 * Database target identification and the Preview/Production isolation guard.
 *
 * Production runs on Neon's `main` branch. Each Preview deployment gets its own
 * Neon branch, whose connection string the Neon integration injects at deploy
 * time. The project-level DATABASE_URL, however, points at Production, so if
 * per-preview branching ever failed a Preview would silently use Production.
 * This guard makes that impossible: in a Vercel Preview environment, a
 * connection whose endpoint matches PRODUCTION_DB_ENDPOINT_ID is refused.
 *
 * One Preview branch can instead read a dedicated catalog UAT database through
 * CATALOG_UAT_DATABASE_URL (see selectDatabaseUrl). The same guard applies.
 *
 * Only the endpoint id (a hostname label) is ever logged — never credentials.
 */

/**
 * Production's Neon endpoint: branch `main` (br-holy-tree-b7kxdd7v) of project
 * neon-sky-pocket (twilight-paper-99193935), as confirmed by Production's build
 * log. It is refused even when PRODUCTION_DB_ENDPOINT_ID is missing or wrong, so
 * a mistyped or copied value can't silently disable the guard.
 */
export const PRODUCTION_ENDPOINT_ID = "ep-winter-glade-b7ewqow0";

export type DbTarget = { endpointId: string | null; host: string; database: string };

/** Extracts a loggable description of a Postgres URL without any credentials. */
export function describeDatabaseUrl(url: string): DbTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL.");
  }
  const host = parsed.hostname.toLowerCase();
  // Neon hosts look like ep-name-words-abc123[-pooler|-r62].region.aws.neon.tech
  const match = host.match(/^(ep-[a-z]+-[a-z]+-[a-z0-9]+)(?:-[a-z0-9]+)*\./);
  return { endpointId: match ? match[1] : null, host, database: parsed.pathname.replace(/^\//, "") || "(default)" };
}

export class ProductionDatabaseInPreviewError extends Error {
  constructor(endpointId: string) {
    super(
      `Refusing to use the Production database (${endpointId}) from a Preview deployment. ` +
        "Preview deployments must use their own Neon branch; check that per-preview branching is enabled in the Neon integration.",
    );
    this.name = "ProductionDatabaseInPreviewError";
  }
}

export class PreviewGuardNotConfiguredError extends Error {
  constructor() {
    super("PRODUCTION_DB_ENDPOINT_ID must be set for Preview deployments so they can prove they are not using Production.");
    this.name = "PreviewGuardNotConfiguredError";
  }
}

export class PreviewGuardMisconfiguredError extends Error {
  constructor(configured: string) {
    super(
      `PRODUCTION_DB_ENDPOINT_ID is ${configured}, but Production's endpoint is ${PRODUCTION_ENDPOINT_ID}. ` +
        "Fix the variable (or, if Production really moved, update PRODUCTION_ENDPOINT_ID in src/server/db/target.ts).",
    );
    this.name = "PreviewGuardMisconfiguredError";
  }
}

/**
 * Throws when a Preview deployment would use the Production database.
 * Fails closed: a Preview without PRODUCTION_DB_ENDPOINT_ID configured, or with
 * one that disagrees with PRODUCTION_ENDPOINT_ID, is refused too.
 */
export function assertPreviewIsolation(url: string, env: Record<string, string | undefined> = process.env): DbTarget {
  const target = describeDatabaseUrl(url);
  if (env.VERCEL_ENV !== "preview") return target;
  const production = env.PRODUCTION_DB_ENDPOINT_ID?.trim().toLowerCase();
  if (!production) throw new PreviewGuardNotConfiguredError();
  if (production !== PRODUCTION_ENDPOINT_ID) throw new PreviewGuardMisconfiguredError(production);
  if (target.endpointId === null || target.endpointId === production) {
    // An unrecognisable host can't be proven isolated, so it is refused as well.
    throw new ProductionDatabaseInPreviewError(target.endpointId ?? target.host);
  }
  return target;
}

export type DatabaseUrlSource = "DATABASE_URL" | "CATALOG_UAT_DATABASE_URL";

/**
 * The connection string this deployment uses. A Preview deployment uses
 * CATALOG_UAT_DATABASE_URL when it is set (it is scoped to the catalog UAT Git
 * branch only); every other environment, Production included, ignores it and
 * uses DATABASE_URL. Callers still run assertPreviewIsolation on the result.
 */
export function selectDatabaseUrl(env: Record<string, string | undefined> = process.env): { url: string; source: DatabaseUrlSource } | null {
  const uat = env.CATALOG_UAT_DATABASE_URL?.trim();
  if (env.VERCEL_ENV === "preview" && uat) return { url: uat, source: "CATALOG_UAT_DATABASE_URL" };
  return env.DATABASE_URL ? { url: env.DATABASE_URL, source: "DATABASE_URL" } : null;
}
