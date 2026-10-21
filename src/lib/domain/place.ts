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
 * missing rather than becoming a wrong one.
 */
import type { RegionKind } from "./catalog";
import { matchDesignations } from "./appellation-audit";
import { normalizeText } from "./normalize";

export type PlaceNode = { kind: RegionKind; name: string };

/** True when the name carries a recognised wine designation, so it names an appellation rather than a region. */
export const namesDesignation = (name: string) => matchDesignations(name).length > 0;

export function placeHierarchy(
  place: PlaceNode,
  /** The place's ancestors, nearest first. */
  ancestors: PlaceNode[],
  label: { matchedFrom: "appellation" | "region"; region: string | null },
): { region: string | null; subregion: string | null } {
  const plain = (n: PlaceNode, kind: RegionKind) => n.kind === kind && !namesDesignation(n.name);
  const labelNamesIt = label.matchedFrom === "region" || (!!normalizeText(label.region) && normalizeText(label.region) === normalizeText(place.name));
  const fromAncestors = (kind: RegionKind) => ancestors.find((a) => plain(a, kind))?.name ?? null;
  return {
    region: plain(place, "region") && labelNamesIt ? place.name : fromAncestors("region"),
    subregion: plain(place, "subregion") ? place.name : fromAncestors("subregion"),
  };
}
