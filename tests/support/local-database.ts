/**
 * Test fixtures rebuild, seed and rewrite their database, so they may only ever
 * touch a database on this machine. Anything that isn't plainly local is refused:
 * remote hosts, look-alike names, host overrides in the query string, multi-host
 * lists, Unix-socket paths and non-Postgres URLs.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class NonLocalDatabaseError extends Error {
  constructor(reason: string) {
    super(`Test fixtures only run against a local database (${reason}).`);
    this.name = "NonLocalDatabaseError";
  }
}

export function assertLocalDatabaseUrl(url: string | undefined): string {
  if (!url) throw new NonLocalDatabaseError("no database URL");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NonLocalDatabaseError("unparseable URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new NonLocalDatabaseError(`unsupported scheme ${parsed.protocol}`);
  if (!LOCAL_HOSTS.has(parsed.hostname)) throw new NonLocalDatabaseError("host is not local");
  // libpq and some drivers let these query parameters replace the host.
  for (const key of ["host", "hostaddr"]) {
    for (const value of parsed.searchParams.getAll(key)) {
      if (!LOCAL_HOSTS.has(value)) throw new NonLocalDatabaseError(`${key} parameter is not local`);
    }
  }
  return url;
}
