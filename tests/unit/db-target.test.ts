import { describe, expect, it } from "vitest";
import { assertPreviewIsolation, describeDatabaseUrl, PreviewGuardNotConfiguredError, ProductionDatabaseInPreviewError } from "@/server/db/target";

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
