export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "JPY", "SEK", "NOK", "DKK",
  "ZAR", "HKD", "SGD", "CNY", "MXN", "BRL", "ARS", "CLP",
] as const;

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

/** Format an amount in its own currency. Amounts are never converted. */
export function formatPrice(amount: number | string | null | undefined, currency: string | null | undefined, locale?: string) {
  if (amount === null || amount === undefined || amount === "" || !currency) return null;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export const PRICE_BASES = [
  { value: "retail_bottle", label: "Bottle, retail" },
  { value: "restaurant_bottle", label: "Bottle, restaurant" },
  { value: "glass", label: "By the glass" },
] as const;

export type PriceBasis = (typeof PRICE_BASES)[number]["value"];

export function priceBasisLabel(value: string | null | undefined) {
  return PRICE_BASES.find((b) => b.value === value)?.label ?? null;
}
