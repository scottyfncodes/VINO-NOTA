/**
 * Open Food Facts JSONL export → catalog product records. ODbL data: imported
 * only into its own source partition, which is not approved for lookups.
 * Product images are never imported (CC BY-SA, separate terms).
 */
import type { ImportBatch, ProductRecord } from "@/lib/domain/catalog";
import { countryCodeFromName } from "@/lib/domain/countries";

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  origins_tags?: string[];
  nutriments?: Record<string, unknown>;
};

/** "75 cl", "750 ml", "0.75 L" → millilitres; anything else → null. */
export function parseVolumeMl(quantity: string | undefined): number | null {
  const m = (quantity ?? "").toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "l" ? 1000 : m[2] === "cl" ? 10 : 1);
  return Number.isFinite(n) && n > 0 && n <= 20000 ? Math.round(n) : null;
}

/** Parses JSONL lines, keeping only products categorised as wine. Malformed lines are counted, not thrown. */
export function openFoodFactsToBatch(lines: Iterable<string>): { batch: ImportBatch; malformed: number; skippedNotWine: number } {
  const products: ProductRecord[] = [];
  let malformed = 0;
  let skippedNotWine = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let p: OffProduct;
    try {
      p = JSON.parse(line) as OffProduct;
    } catch {
      malformed++;
      continue;
    }
    if (!p.categories_tags?.includes("en:wines")) {
      skippedNotWine++;
      continue;
    }
    const alcohol = Number(p.nutriments?.alcohol ?? p.nutriments?.alcohol_100g);
    const origins = (p.origins_tags ?? []).map((t) => countryCodeFromName(t.replace(/^en:/, "").replace(/-/g, " ")));
    const origin = origins.length === 1 ? origins[0] : null;
    products.push({
      externalId: String(p.code ?? ""),
      barcode: p.code ?? null,
      productName: p.product_name ?? "",
      producerName: (p.brands ?? "").split(",")[0]?.trim() || null,
      wineExternalId: null,
      vintage: null,
      isNonVintage: false,
      volumeMl: parseVolumeMl(p.quantity),
      alcoholPct: Number.isFinite(alcohol) && alcohol > 0 ? alcohol : null,
      country: origin,
    });
  }
  return { batch: { regions: [], producers: [], grapes: [], wines: [], products }, malformed, skippedNotWine };
}
