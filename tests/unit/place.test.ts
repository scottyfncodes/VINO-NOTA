import { describe, expect, it } from "vitest";
import { namesDesignation, placeHierarchy, type PlaceNode } from "@/lib/domain/place";

const region = (name: string): PlaceNode => ({ kind: "region", name });
const subregion = (name: string): PlaceNode => ({ kind: "subregion", name });
const appellation = (name: string): PlaceNode => ({ kind: "appellation", name });
const fromAppellation = { matchedFrom: "appellation" as const, region: null };
const fromRegion = (text: string) => ({ matchedFrom: "region" as const, region: text });

describe("placeHierarchy", () => {
  it("never offers an appellation stored as a region as the region (Margaux AOC)", () => {
    expect(placeHierarchy(region("Margaux AOC"), [], fromAppellation)).toEqual({ region: null, subregion: null });
    // Not even when the label's region text names it: the name carries a designation.
    expect(placeHierarchy(region("Margaux AOC"), [], fromRegion("Margaux AOC"))).toEqual({ region: null, subregion: null });
  });

  it("does not let a place matched from appellation text supply its own name as the region (Barolo)", () => {
    expect(placeHierarchy(region("Barolo"), [], fromAppellation)).toEqual({ region: null, subregion: null });
    expect(placeHierarchy(region("Barolo"), [region("Piedmont")], fromAppellation)).toEqual({ region: "Piedmont", subregion: null });
  });

  it("keeps a region the label's region text names (Rioja)", () => {
    expect(placeHierarchy(region("Rioja"), [], fromRegion("Rioja"))).toEqual({ region: "Rioja", subregion: null });
    // Matched from the appellation text, but the label's region says Rioja too (any case or accents).
    expect(placeHierarchy(region("Rioja"), [], { matchedFrom: "appellation", region: "RIOJA" })).toEqual({ region: "Rioja", subregion: null });
    // A different region text doesn't count.
    expect(placeHierarchy(region("Rioja"), [], { matchedFrom: "appellation", region: "Navarra" })).toEqual({ region: null, subregion: null });
  });

  it("keeps Margaux → Bordeaux / Médoc for a real appellation", () => {
    const chain = [subregion("Médoc"), region("Bordeaux")];
    expect(placeHierarchy(appellation("Margaux"), chain, fromAppellation)).toEqual({ region: "Bordeaux", subregion: "Médoc" });
    expect(placeHierarchy(appellation("Margaux"), chain, fromRegion("Margaux"))).toEqual({ region: "Bordeaux", subregion: "Médoc" });
  });

  it("keeps a subregion's own name, and its region from the nearest region ancestor", () => {
    expect(placeHierarchy(subregion("Médoc"), [region("Bordeaux")], fromAppellation)).toEqual({ region: "Bordeaux", subregion: "Médoc" });
    expect(placeHierarchy(region("Bordeaux"), [], fromRegion("Bordeaux"))).toEqual({ region: "Bordeaux", subregion: null });
  });

  it("skips designation-bearing ancestors instead of offering them", () => {
    // Côtes du Ventoux AOC's parent in the real snapshot is "Côtes du Rhône AOC", stored as a region.
    expect(placeHierarchy(region("Côtes du Ventoux AOC"), [region("Côtes du Rhône AOC")], fromRegion("Côtes du Ventoux"))).toEqual({ region: null, subregion: null });
    expect(placeHierarchy(appellation("Borba"), [region("Alentejo (DOC)"), region("Portugal wine")], fromAppellation)).toEqual({ region: "Portugal wine", subregion: null });
    expect(placeHierarchy(appellation("X"), [subregion("Bairrada (DOC)"), subregion("Beiras")], fromAppellation)).toEqual({ region: null, subregion: "Beiras" });
  });
});

describe("namesDesignation", () => {
  it("uses the appellation audit's rules", () => {
    for (const name of ["Margaux AOC", "Douro (DOC)", "Priorat (DO)", "Calatayud PDO", "Schilcherland DAC", "Barolo DOCG"]) expect(namesDesignation(name)).toBe(true);
    for (const name of ["Rioja", "Bordeaux", "Douro", "Médoc", "Vale do Douro", "Dão", "Central Otago wine region"]) expect(namesDesignation(name)).toBe(false);
  });
});
