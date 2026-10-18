import { vintageLabel } from "@/lib/domain/wine";

/** Parses a YYYY-MM-DD calendar date without any time-zone shift. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDate(value: string, locale?: string, style: "long" | "medium" | "short" = "medium") {
  const opts: Intl.DateTimeFormatOptions =
    style === "long" ? { day: "numeric", month: "long", year: "numeric" } : style === "medium" ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(parseDateOnly(value));
}

export function formatMonth(value: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(parseDateOnly(`${value}-01`));
}

export function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function wineTitle(w: ({ name: string } | { wineName: string }) & { vintage: number | null; isNonVintage?: boolean | null }) {
  const name = ("wineName" in w && w.wineName) || ("name" in w ? w.name : "");
  const v = vintageLabel(w.vintage, w.isNonVintage);
  return v ? `${name} ${v}` : name;
}

export function formatNumber(n: number, locale?: string, digits = 1) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
