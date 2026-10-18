import { describe, expect, it } from "vitest";
import {
  applyFilters,
  chronology,
  median,
  palateFingerprint,
  personalInsight,
  ratingDistribution,
  sampleStrength,
  valueLandscape,
  type AnalyticsTasting,
} from "@/lib/domain/analytics";

function t(partial: Partial<AnalyticsTasting> & { id: string }): AnalyticsTasting {
  return {
    wineId: `w-${partial.id}`,
    wineName: "Wine",
    producer: "Producer",
    vintage: 2020,
    wineType: "red",
    country: "FR",
    region: null,
    tastedOn: "2026-01-01",
    score: null,
    price: null,
    currency: null,
    priceBasis: null,
    observations: [],
    ...partial,
  };
}

const fixture: AnalyticsTasting[] = [
  t({ id: "a", score: 9.2, price: 30, currency: "USD", priceBasis: "retail_bottle", tastedOn: "2026-01-05", observations: [{ dimension: "body", status: "assessed", value: 4, descriptor: null }, { dimension: "aroma", status: "assessed", value: null, descriptor: "Cherry" }] }),
  t({ id: "b", score: 7.0, price: 80, currency: "USD", priceBasis: "retail_bottle", tastedOn: "2026-01-20", observations: [{ dimension: "body", status: "assessed", value: 4, descriptor: null }, { dimension: "tannin", status: "not_applicable", value: null, descriptor: null }] }),
  t({ id: "c", score: 10.0, price: 25, currency: "EUR", tastedOn: "2026-03-02", wineType: "white", observations: [{ dimension: "body", status: "assessed", value: 2, descriptor: null }, { dimension: "aroma", status: "assessed", value: null, descriptor: "cherry" }] }),
  t({ id: "d", score: null, price: 20, currency: "USD", tastedOn: "2026-03-10", wineType: "white", observations: [{ dimension: "body", status: "unknown", value: null, descriptor: null }] }),
  t({ id: "e", score: 0.0, tastedOn: "2026-03-11", wineType: "white" }),
  t({ id: "f", score: 8.5, price: 40, currency: "USD", priceBasis: "glass", tastedOn: "2026-03-12" }),
];

describe("ratingDistribution", () => {
  const d = ratingDistribution(fixture);
  it("excludes unrated tastings instead of counting them as zero", () => {
    expect(d.rated).toBe(5);
    expect(d.unrated).toBe(1);
    expect(d.bins[0].count).toBe(1); // only the genuine 0.0
  });
  it("places 10.0 in the top bin and 9.2 alongside it", () => {
    expect(d.bins[9].tastingIds.sort()).toEqual(["a", "c"]);
  });
  it("computes mean and median from rated tastings only", () => {
    expect(d.mean).toBeCloseTo((9.2 + 7 + 10 + 0 + 8.5) / 5, 10);
    expect(d.median).toBe(8.5);
    expect(d.min).toBe(0);
    expect(d.max).toBe(10);
  });
  it("handles an empty journal", () => {
    const empty = ratingDistribution([]);
    expect(empty.rated).toBe(0);
    expect(empty.mean).toBeNull();
    expect(empty.median).toBeNull();
  });
});

describe("median", () => {
  it("averages the two middle values for even samples", () => {
    expect(median([1, 4, 2, 3])).toBe(2.5);
  });
});

describe("palateFingerprint", () => {
  const f = palateFingerprint(fixture);
  const body = f.dimensions.find((d) => d.key === "body")!;
  it("counts only assessed values and reports other statuses separately", () => {
    expect(body.assessed).toBe(3);
    expect(body.unknown).toBe(1);
    expect(body.notAssessed).toBe(2);
    expect(body.levels[3].count).toBe(2);
    expect(body.levels[3].meanScore).toBeCloseTo(8.1, 10);
    expect(body.levels[1].meanScore).toBe(10);
  });
  it("records not-applicable tannin without inventing a value", () => {
    const tannin = f.dimensions.find((d) => d.key === "tannin")!;
    expect(tannin.assessed).toBe(0);
    expect(tannin.notApplicable).toBe(1);
    expect(tannin.meanValue).toBeNull();
  });
  it("merges descriptors case-insensitively and counts per tasting", () => {
    expect(f.descriptors[0]).toMatchObject({ count: 2, ratedCount: 2 });
    expect(f.descriptors[0].meanScore).toBeCloseTo(9.6, 10);
  });
});

describe("valueLandscape", () => {
  it("compares within one currency and never mixes currencies", () => {
    const v = valueLandscape(fixture, "USD");
    expect(v.currency).toBe("USD");
    expect(v.points.map((p) => p.id).sort()).toEqual(["a", "b", "f"]);
    expect(v.excluded.otherCurrency).toBe(1);
    expect(v.excluded.noScore).toBe(1);
    expect(v.medianPrice).toBe(40);
  });
  it("defaults to the most-used currency", () => {
    expect(valueLandscape(fixture).currency).toBe("USD");
  });
  it("can restrict to one price basis", () => {
    const v = valueLandscape(fixture, "USD", "retail_bottle");
    expect(v.points.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });
  it("lists value discoveries only with at least three points", () => {
    const v = valueLandscape(fixture, "USD");
    expect(v.discoveries.map((p) => p.id)).toEqual(["a", "f"]);
    expect(valueLandscape(fixture, "EUR").discoveries).toEqual([]);
  });
});

describe("chronology", () => {
  const c = chronology(fixture);
  it("orders points by tasting date and fills empty months", () => {
    expect(c.points[0].id).toBe("a");
    expect(c.months.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(c.months[1]).toMatchObject({ count: 0, rated: 0, meanScore: null });
    expect(c.months[2]).toMatchObject({ count: 4, rated: 3 });
  });
});

describe("applyFilters", () => {
  it("filters by type and date range", () => {
    const r = applyFilters(fixture, { wineType: "white", from: "2026-03-05" });
    expect(r.map((x) => x.id)).toEqual(["d", "e"]);
  });
});

describe("personalInsight", () => {
  const labels = { wineType: (v: string) => v[0].toUpperCase() + v.slice(1), country: (v: string) => v };
  it("returns nothing when there is too little data", () => {
    expect(personalInsight(fixture, labels)).toBeNull();
  });
  it("produces an evidence-backed comparison with group sizes", () => {
    const rows = [
      ...[9, 8.5, 9, 8.8].map((score, i) => t({ id: `r${i}`, score, wineType: "red", country: "FR" })),
      ...[6, 6.5, 7, 6.2].map((score, i) => t({ id: `w${i}`, score, wineType: "white", country: "FR" })),
    ];
    const insight = personalInsight(rows, labels)!;
    expect(insight.kind).toBe("wineType");
    expect(insight.groups.map((g) => [g.key, g.n])).toEqual([["red", 4], ["white", 4]]);
    expect(insight.statement).toContain("2.4 points higher");
  });
  it("stays silent when the gap is small", () => {
    const rows = [...Array(5)].flatMap((_, i) => [t({ id: `r${i}`, score: 8, wineType: "red" }), t({ id: `w${i}`, score: 7.8, wineType: "white" })]);
    expect(personalInsight(rows, labels)).toBeNull();
  });
});

describe("sampleStrength", () => {
  it("qualifies small samples", () => {
    expect(sampleStrength(0)).toBe("none");
    expect(sampleStrength(3)).toBe("anecdotal");
    expect(sampleStrength(10)).toBe("emerging");
    expect(sampleStrength(40)).toBe("established");
  });
});
