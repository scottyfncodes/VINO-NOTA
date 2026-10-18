import { describe, expect, it } from "vitest";
import { formatScore, parseScore } from "@/lib/domain/score";
import { normalizeProducer, normalizeText, wineIdentityKey } from "@/lib/domain/normalize";
import { tastingInputSchema, wineInputSchema } from "@/lib/domain/validation";
import { formatPrice } from "@/lib/domain/currency";
import { countryCodeFromName } from "@/lib/domain/countries";

describe("parseScore", () => {
  it("treats empty input as unrated, not zero", () => {
    expect(parseScore("")).toEqual({ ok: true, value: null });
    expect(parseScore(null)).toEqual({ ok: true, value: null });
  });
  it("accepts 0.0 and 10.0 and one decimal place", () => {
    expect(parseScore(0)).toEqual({ ok: true, value: 0 });
    expect(parseScore("10")).toEqual({ ok: true, value: 10 });
    expect(parseScore("8,5")).toEqual({ ok: true, value: 8.5 });
  });
  it("rejects out-of-range and over-precise scores", () => {
    expect(parseScore(10.1).ok).toBe(false);
    expect(parseScore(-1).ok).toBe(false);
    expect(parseScore(8.25).ok).toBe(false);
    expect(parseScore("abc").ok).toBe(false);
  });
  it("formats", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore("9.0")).toBe("9.0");
  });
});

describe("normalisation and identity", () => {
  it("strips accents, punctuation and producer prefixes", () => {
    expect(normalizeText("Château Cos d'Estournel")).toBe("chateau cos destournel");
    expect(normalizeProducer("Château Cos d'Estournel")).toBe(normalizeProducer("Cos d’Estournel"));
  });
  it("distinguishes vintages, NV and unknown", () => {
    const base = { producer: "Krug", name: "Grande Cuvée" };
    expect(wineIdentityKey({ ...base, vintage: 2008 })).not.toBe(wineIdentityKey({ ...base, isNonVintage: true }));
    expect(wineIdentityKey({ ...base, isNonVintage: true })).not.toBe(wineIdentityKey({ ...base }));
  });
});

describe("wine validation", () => {
  const valid = { name: "Barolo", wineType: "red", grapes: [] };
  it("requires a name and a valid type", () => {
    expect(wineInputSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(wineInputSchema.safeParse({ ...valid, wineType: "blue" }).success).toBe(false);
  });
  it("rejects a vintage on a non-vintage wine", () => {
    expect(wineInputSchema.safeParse({ ...valid, isNonVintage: true, vintage: 2019 }).success).toBe(false);
  });
  it("requires a country when a region is given", () => {
    expect(wineInputSchema.safeParse({ ...valid, region: "Piedmont" }).success).toBe(false);
    expect(wineInputSchema.safeParse({ ...valid, region: "Piedmont", country: "IT" }).success).toBe(true);
  });
  it("rejects blends over 100% and duplicate grapes", () => {
    expect(wineInputSchema.safeParse({ ...valid, grapes: [{ name: "A", percentage: 70 }, { name: "B", percentage: 40 }] }).success).toBe(false);
    expect(wineInputSchema.safeParse({ ...valid, grapes: [{ name: "Nebbiolo" }, { name: "nebbiolo" }] }).success).toBe(false);
  });
});

describe("tasting validation", () => {
  const valid = { tastedOn: "2026-01-01" };
  it("keeps missing scores and prices as null", () => {
    const r = tastingInputSchema.parse(valid);
    expect(r.personalScore).toBeNull();
    expect(r.purchasePrice).toBeNull();
  });
  it("requires a currency whenever a price is given", () => {
    expect(tastingInputSchema.safeParse({ ...valid, purchasePrice: 20 }).success).toBe(false);
    expect(tastingInputSchema.safeParse({ ...valid, purchasePrice: 20, currency: "EUR" }).success).toBe(true);
    expect(tastingInputSchema.safeParse({ ...valid, purchasePrice: 20, currency: "euro" }).success).toBe(false);
  });
  it("rejects future dates and invalid scores", () => {
    expect(tastingInputSchema.safeParse({ tastedOn: "2999-01-01" }).success).toBe(false);
    expect(tastingInputSchema.safeParse({ ...valid, personalScore: 11 }).success).toBe(false);
  });
  it("distinguishes observation statuses and forbids values on non-assessed rows", () => {
    expect(tastingInputSchema.safeParse({ ...valid, observations: [{ dimension: "tannin", status: "not_applicable" }] }).success).toBe(true);
    expect(tastingInputSchema.safeParse({ ...valid, observations: [{ dimension: "tannin", status: "absent", value: 3 }] }).success).toBe(false);
    expect(tastingInputSchema.safeParse({ ...valid, observations: [{ dimension: "body", status: "assessed" }] }).success).toBe(false);
    expect(tastingInputSchema.safeParse({ ...valid, observations: [{ dimension: "sparkle", status: "assessed", value: 2 }] }).success).toBe(false);
  });
  it("rejects duplicate structural observations", () => {
    const obs = [{ dimension: "body", status: "assessed", value: 2 }, { dimension: "body", status: "assessed", value: 3 }];
    expect(tastingInputSchema.safeParse({ ...valid, observations: obs }).success).toBe(false);
  });
  it("normalises tags", () => {
    expect(tastingInputSchema.parse({ ...valid, tags: ["Birthday", "birthday ", ""] }).tags).toEqual(["birthday"]);
  });
});

describe("currency and country helpers", () => {
  it("formats in the original currency", () => {
    expect(formatPrice(25, "EUR", "en-US")).toBe("€25");
    expect(formatPrice(null, "EUR")).toBeNull();
  });
  it("maps label country names to codes", () => {
    expect(countryCodeFromName("France")).toBe("FR");
    expect(countryCodeFromName("USA")).toBe("US");
    expect(countryCodeFromName("Atlantis")).toBeNull();
  });
});
