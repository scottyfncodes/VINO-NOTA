import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl, NonLocalDatabaseError } from "../support/local-database";

describe("assertLocalDatabaseUrl", () => {
  it.each([
    "postgresql://vino:vino@localhost:5432/vinonota",
    "postgres://vino@127.0.0.1/vinonota_test",
    "postgresql://vino@[::1]:5432/vinonota",
    "postgresql://vino@localhost/vinonota?sslmode=disable",
    "postgresql://vino@localhost/vinonota?host=localhost",
  ])("accepts the local database %s", (url) => {
    expect(assertLocalDatabaseUrl(url)).toBe(url);
  });

  it.each([
    ["a Neon endpoint", "postgresql://u:p@ep-winter-glade-b7ewqow0.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require"],
    ["a Neon pooler", "postgres://u:p@ep-green-wave-b7tysfv5-pooler.c-13.us-east-1.aws.neon.tech/neondb"],
    ["a look-alike subdomain", "postgresql://u@localhost.example.com/db"],
    ["a look-alike prefix", "postgresql://u@localhost-db.internal/db"],
    ["a credential that looks like a host", "postgresql://localhost:pw@db.example.com/db"],
    ["a host query override", "postgresql://u@localhost/db?host=ep-winter-glade-b7ewqow0.c-13.us-east-1.aws.neon.tech"],
    ["a hostaddr query override", "postgresql://u@localhost/db?hostaddr=203.0.113.7"],
    ["a second host override after a local one", "postgresql://u@localhost/db?host=localhost&host=db.example.com"],
    ["a multi-host list", "postgresql://u@localhost,db.example.com/db"],
    ["a Unix socket path", "postgresql://u@localhost/db?host=/var/run/postgresql"],
    ["a private network address", "postgresql://u@10.0.0.5/db"],
    ["an all-interfaces address", "postgresql://u@0.0.0.0/db"],
    ["an encoded host", "postgresql://u@%6C%6F%63%61%6C%68%6F%73%74.example.com/db"],
    ["a non-Postgres scheme", "mysql://u@localhost/db"],
    ["an http URL", "http://localhost:5432/db"],
    ["an empty value", ""],
    ["a missing value", undefined],
    ["garbage", "not a url"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(NonLocalDatabaseError);
  });
});
