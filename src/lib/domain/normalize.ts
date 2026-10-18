/** Lower-case, accent-free, punctuation-free, single-spaced form for matching. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const PRODUCER_NOISE = new Set(["domaine", "chateau", "bodega", "bodegas", "weingut", "tenuta", "cantina", "winery", "estate", "vineyards", "wines", "the"]);

/** Producer names commonly appear with or without a "Domaine"/"Château" prefix. */
export function normalizeProducer(value: string | null | undefined): string {
  const words = normalizeText(value).split(" ").filter(Boolean);
  const core = words.filter((w) => !PRODUCER_NOISE.has(w));
  return (core.length ? core : words).join(" ");
}

/**
 * Identity key used to detect probable duplicate wine records:
 * same producer, same name, same vintage (or both NV / both unknown).
 */
export function wineIdentityKey(input: {
  producer?: string | null;
  name: string;
  vintage?: number | null;
  isNonVintage?: boolean | null;
}): string {
  const vintagePart = input.vintage ? String(input.vintage) : input.isNonVintage ? "nv" : "unknown";
  return [normalizeProducer(input.producer), normalizeText(input.name), vintagePart].join("|");
}

export function cleanOptional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/\s+/g, " ");
  return v.length ? v : null;
}
