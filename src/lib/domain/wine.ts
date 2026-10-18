export const WINE_TYPES = [
  { value: "red", label: "Red" },
  { value: "white", label: "White" },
  { value: "rose", label: "Rosé" },
  { value: "sparkling", label: "Sparkling" },
  { value: "orange", label: "Orange" },
  { value: "dessert", label: "Dessert" },
  { value: "fortified", label: "Fortified" },
  { value: "other", label: "Other" },
] as const;

export type WineType = (typeof WINE_TYPES)[number]["value"];

export function wineTypeLabel(value: string | null | undefined) {
  return WINE_TYPES.find((t) => t.value === value)?.label ?? "Wine";
}

export function isWineType(value: string): value is WineType {
  return WINE_TYPES.some((t) => t.value === value);
}

/** Wine styles for which tannin is a meaningful structural measurement by default. */
export function tanninTypicallyApplies(type: WineType | string | null | undefined) {
  return type === "red" || type === "orange" || type === "fortified";
}

export function vintageLabel(vintage: number | null | undefined, isNonVintage: boolean | null | undefined) {
  if (vintage) return String(vintage);
  if (isNonVintage) return "NV";
  return null;
}

export const IMAGE_TYPES = [
  { value: "front_label", label: "Front label" },
  { value: "back_label", label: "Back label" },
  { value: "bottle", label: "Bottle" },
  { value: "other", label: "Other" },
] as const;
