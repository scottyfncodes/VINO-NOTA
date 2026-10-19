/**
 * Shared guard for catalog scripts that write to a database. Prints only the
 * endpoint id, never credentials, and refuses Production unless the operator
 * passes --allow-production AND names the endpoint in CATALOG_CONFIRM_ENDPOINT
 * (so a copied command can't hit Production by accident).
 */
import { assertPreviewIsolation } from "../../src/server/db/target";

export function databaseTarget(argv: string[]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const target = assertPreviewIsolation(url);
  const label = target.endpointId ?? target.host;
  const production = process.env.PRODUCTION_DB_ENDPOINT_ID?.trim().toLowerCase();
  const isProduction = !!production && target.endpointId === production;
  if (isProduction && (!argv.includes("--allow-production") || process.env.CATALOG_CONFIRM_ENDPOINT !== label)) {
    throw new Error(`Refusing to write to the Production database (${label}). Pass --allow-production and set CATALOG_CONFIRM_ENDPOINT=${label} once the change is approved.`);
  }
  if (!production && !/^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(target.host) && !argv.includes("--remote-ok")) {
    throw new Error(`PRODUCTION_DB_ENDPOINT_ID is not set, so ${label} can't be proven non-Production. Set it (or pass --remote-ok for a known non-Production branch).`);
  }
  return { label, isProduction };
}

export const arg = (argv: string[], name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
