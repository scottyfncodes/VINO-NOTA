import { describe, expect, it } from "vitest";
import { toOutcome } from "@/server/recognition/anthropic";

const g = <T,>(value: T | null, confidence = 0.9) => ({ value, confidence });
const base = {
  is_wine_label: true,
  extracted_text: "CHÂTEAU EXAMPLE\n2015\n2016",
  name: g("Grand Vin"),
  producer: g("Château Example"),
  vintage: g(2015),
  is_non_vintage: g(false),
  wine_type: g("red" as const),
  country: g("France"),
  region: g(null as string | null, 0),
  subregion: g(null as string | null, 0),
  appellation: g("Margaux"),
  grapes: g([] as string[]),
  alcohol_pct: g(13.5),
  issues: [] as ("glare" | "multiple_vintages")[],
};

describe("recognition output normalisation", () => {
  it("drops the vintage when the label shows several", () => {
    const r = toOutcome("test", { ...base, issues: ["multiple_vintages"] });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.candidate.vintage).toEqual({ value: null, confidence: 0 });
  });
  it("discards implausible values and empty grape lists", () => {
    const r = toOutcome("test", { ...base, vintage: g(3015), alcohol_pct: g(80) });
    if (r.status !== "ok") throw new Error();
    expect(r.candidate.vintage.value).toBeNull();
    expect(r.candidate.alcoholPct.value).toBeNull();
    expect(r.candidate.grapes.value).toBeNull();
  });
  it("flags non-labels with zero overall confidence", () => {
    const r = toOutcome("test", { ...base, is_wine_label: false });
    if (r.status !== "ok") throw new Error();
    expect(r.overallConfidence).toBe(0);
    expect(r.issues).toContain("not_a_wine_label");
  });
  it("clamps confidences into 0..1", () => {
    const r = toOutcome("test", { ...base, name: g("X", 7) });
    if (r.status !== "ok") throw new Error();
    expect(r.candidate.name.confidence).toBe(1);
  });
});
