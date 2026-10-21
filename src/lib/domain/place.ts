/**
 * Which region and subregion a matched catalog place may supply to a label
 * reading. Pure and client-safe.
 *
 * Two rules keep an appellation from being offered as a region:
 * - A place matched from the label's appellation text is the appellation the
 *   label named, so it supplies its own name as the region only when the
 *   label's region text names it too. Otherwise only an ancestor can.
 * - A name carrying a wine designation ("Margaux AOC", "Douro (DOC)") is never
 *   offered as a region or subregion, whatever kind the catalog gives it. The
 *   designation rules are the appellation audit's.
 * Ancestors that fail either rule are skipped, so a missing value stays
 * missing rather than becoming a wrong one. Names offered are tidied for
 * display ("Burgundy wine region" → "Burgundy"); the catalog keeps the source
 * name.
 */
import type { RegionKind } from "./catalog";
import { baseName, matchDesignations } from "./appellation-audit";
import { normalizeText } from "./normalize";

export type PlaceNode = { kind: RegionKind; name: string };

/** True when the name carries a recognised wine designation, so it names an appellation rather than a region. */
export const namesDesignation = (name: string) => matchDesignations(name).length > 0;

/**
 * A Wikidata region label tidied for display: drops a trailing "wine region",
 * "wine-producing region", "Geographical Indication", "wine" or parenthetical
 * tag ("(RDD)"). Display only; never empty, and anything else is left as is.
 */
export function tidyRegionName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const tidied = trimmed
    .replace(/\s*\([^()]*\)$/, "")
    .replace(/\s+(?:wine[- ]?(?:producing |growing )?regions?|winegrowing regions?|geographical indication|wine)$/i, "")
    .trim();
  return tidied || trimmed;
}

/**
 * The texts the lookup tries for the place, in order: the label's appellation,
 * then its designation-stripped form ("Rioja DOCa" → "Rioja"), then the same
 * for the label's region. Duplicates are dropped; the first source wins.
 */
export function placeQueries(appellation: string | null, region: string | null): { key: string; matchedFrom: "appellation" | "region" }[] {
  const out: { key: string; matchedFrom: "appellation" | "region" }[] = [];
  const add = (text: string | null, matchedFrom: "appellation" | "region") => {
    if (!text) return;
    for (const variant of [text, baseName(text, matchDesignations(text))]) {
      const key = normalizeText(variant);
      if (key && !out.some((q) => q.key === key)) out.push({ key, matchedFrom });
    }
  };
  add(appellation, "appellation");
  add(region, "region");
  return out;
}

export function placeHierarchy(
  place: PlaceNode,
  /** The place's ancestors, nearest first. */
  ancestors: PlaceNode[],
  label: { matchedFrom: "appellation" | "region"; region: string | null },
): { region: string | null; subregion: string | null } {
  const plain = (n: PlaceNode, kind: RegionKind) => n.kind === kind && !namesDesignation(n.name);
  const labelRegion = normalizeText(label.region);
  const labelNamesIt = label.matchedFrom === "region" || (!!labelRegion && [place.name, tidyRegionName(place.name)].some((n) => normalizeText(n) === labelRegion));
  const fromAncestors = (kind: RegionKind) => {
    const found = ancestors.find((a) => plain(a, kind));
    return found ? tidyRegionName(found.name) : null;
  };
  return {
    region: plain(place, "region") && labelNamesIt ? tidyRegionName(place.name) : fromAncestors("region"),
    subregion: plain(place, "subregion") ? tidyRegionName(place.name) : fromAncestors("subregion"),
  };
}
