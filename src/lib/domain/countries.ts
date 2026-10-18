/**
 * Wine-producing countries offered in the origin picker.
 * `numeric` is the ISO 3166-1 numeric code, which matches the feature ids in
 * the Natural Earth (world-atlas) dataset used by the Regions map.
 */
export type Country = { code: string; numeric: string; name: string };

export const COUNTRIES: Country[] = [
  { code: "AR", numeric: "032", name: "Argentina" },
  { code: "AM", numeric: "051", name: "Armenia" },
  { code: "AU", numeric: "036", name: "Australia" },
  { code: "AT", numeric: "040", name: "Austria" },
  { code: "BE", numeric: "056", name: "Belgium" },
  { code: "BR", numeric: "076", name: "Brazil" },
  { code: "BG", numeric: "100", name: "Bulgaria" },
  { code: "CA", numeric: "124", name: "Canada" },
  { code: "CL", numeric: "152", name: "Chile" },
  { code: "CN", numeric: "156", name: "China" },
  { code: "HR", numeric: "191", name: "Croatia" },
  { code: "CY", numeric: "196", name: "Cyprus" },
  { code: "CZ", numeric: "203", name: "Czechia" },
  { code: "DK", numeric: "208", name: "Denmark" },
  { code: "FR", numeric: "250", name: "France" },
  { code: "GE", numeric: "268", name: "Georgia" },
  { code: "DE", numeric: "276", name: "Germany" },
  { code: "GR", numeric: "300", name: "Greece" },
  { code: "HU", numeric: "348", name: "Hungary" },
  { code: "IN", numeric: "356", name: "India" },
  { code: "IL", numeric: "376", name: "Israel" },
  { code: "IT", numeric: "380", name: "Italy" },
  { code: "JP", numeric: "392", name: "Japan" },
  { code: "LB", numeric: "422", name: "Lebanon" },
  { code: "LU", numeric: "442", name: "Luxembourg" },
  { code: "MT", numeric: "470", name: "Malta" },
  { code: "MX", numeric: "484", name: "Mexico" },
  { code: "MD", numeric: "498", name: "Moldova" },
  { code: "ME", numeric: "499", name: "Montenegro" },
  { code: "MA", numeric: "504", name: "Morocco" },
  { code: "NL", numeric: "528", name: "Netherlands" },
  { code: "NZ", numeric: "554", name: "New Zealand" },
  { code: "MK", numeric: "807", name: "North Macedonia" },
  { code: "PE", numeric: "604", name: "Peru" },
  { code: "PT", numeric: "620", name: "Portugal" },
  { code: "RO", numeric: "642", name: "Romania" },
  { code: "RS", numeric: "688", name: "Serbia" },
  { code: "SK", numeric: "703", name: "Slovakia" },
  { code: "SI", numeric: "705", name: "Slovenia" },
  { code: "ZA", numeric: "710", name: "South Africa" },
  { code: "ES", numeric: "724", name: "Spain" },
  { code: "SE", numeric: "752", name: "Sweden" },
  { code: "CH", numeric: "756", name: "Switzerland" },
  { code: "TN", numeric: "788", name: "Tunisia" },
  { code: "TR", numeric: "792", name: "Türkiye" },
  { code: "UA", numeric: "804", name: "Ukraine" },
  { code: "GB", numeric: "826", name: "United Kingdom" },
  { code: "US", numeric: "840", name: "United States" },
  { code: "UY", numeric: "858", name: "Uruguay" },
];

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return byCode.get(code)?.name ?? code;
}

export function isKnownCountry(code: string): boolean {
  return byCode.has(code);
}

export function countryByCode(code: string): Country | undefined {
  return byCode.get(code);
}

/** Resolve a free-text country name (e.g. from a label) to a known code. */
export function countryCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const aliases: Record<string, string> = {
    usa: "US",
    "united states of america": "US",
    america: "US",
    uk: "GB",
    england: "GB",
    "great britain": "GB",
    turkey: "TR",
    "czech republic": "CZ",
    macedonia: "MK",
  };
  if (aliases[n]) return aliases[n];
  const hit = COUNTRIES.find((c) => c.name.toLowerCase() === n || c.code.toLowerCase() === n);
  return hit?.code ?? null;
}
