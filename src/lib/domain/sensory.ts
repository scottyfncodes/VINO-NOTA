/**
 * Sensory vocabulary. Structural dimensions are ordinal 1–5 scales.
 * An observation can also be explicitly "unknown", "absent" or "not applicable";
 * when the user never touches a dimension it is simply not assessed (no record).
 */

export type ObservationStatus = "assessed" | "unknown" | "absent" | "not_applicable";

export type StructuralDimension = {
  key: string;
  label: string;
  /** Labels for values 1–5. */
  scale: [string, string, string, string, string];
  /** Shown in the default quick flow (otherwise under advanced). */
  quick: boolean;
  /** Whether "absent" is a meaningful answer (e.g. no perceptible tannin). */
  allowAbsent: boolean;
};

export const STRUCTURAL_DIMENSIONS: StructuralDimension[] = [
  { key: "body", label: "Body", scale: ["Very light", "Light", "Medium", "Full", "Very full"], quick: true, allowAbsent: false },
  { key: "acidity", label: "Acidity", scale: ["Low", "Medium−", "Medium", "Medium+", "High"], quick: true, allowAbsent: false },
  { key: "sweetness", label: "Sweetness", scale: ["Bone dry", "Dry", "Off-dry", "Medium-sweet", "Sweet"], quick: true, allowAbsent: false },
  { key: "tannin", label: "Tannin", scale: ["Low", "Medium−", "Medium", "Medium+", "High"], quick: true, allowAbsent: true },
  { key: "finish", label: "Finish", scale: ["Short", "Medium−", "Medium", "Medium+", "Long"], quick: true, allowAbsent: false },
  { key: "aroma_intensity", label: "Aroma intensity", scale: ["Faint", "Light", "Medium", "Pronounced", "Powerful"], quick: false, allowAbsent: false },
  { key: "colour_intensity", label: "Colour intensity", scale: ["Pale", "Pale+", "Medium", "Deep−", "Deep"], quick: false, allowAbsent: false },
  { key: "alcohol", label: "Alcohol (perceived)", scale: ["Low", "Medium−", "Medium", "Medium+", "High"], quick: false, allowAbsent: false },
  { key: "balance", label: "Balance", scale: ["Disjointed", "Uneven", "Reasonable", "Balanced", "Seamless"], quick: false, allowAbsent: false },
  { key: "complexity", label: "Complexity", scale: ["Simple", "Modest", "Moderate", "Layered", "Profound"], quick: false, allowAbsent: false },
  { key: "mousse", label: "Mousse", scale: ["Delicate", "Soft", "Moderate", "Creamy", "Aggressive"], quick: false, allowAbsent: true },
];

export const QUICK_DIMENSIONS = STRUCTURAL_DIMENSIONS.filter((d) => d.quick);
export const ADVANCED_DIMENSIONS = STRUCTURAL_DIMENSIONS.filter((d) => !d.quick);

export function dimensionByKey(key: string) {
  return STRUCTURAL_DIMENSIONS.find((d) => d.key === key);
}

/** Categorical observations recorded as descriptors. */
export const CATEGORICAL_DIMENSIONS = {
  clarity: { label: "Clarity", options: ["Clear", "Hazy", "Cloudy"] },
  colour: {
    label: "Colour",
    options: ["Lemon-green", "Lemon", "Gold", "Amber", "Pink", "Salmon", "Orange", "Purple", "Ruby", "Garnet", "Tawny", "Brown"],
  },
  development: { label: "Development", options: ["Youthful", "Developing", "Fully developed", "Tired"] },
  texture: { label: "Texture", options: ["Silky", "Creamy", "Grippy", "Chalky", "Oily", "Crisp", "Lean"] },
} as const;

export type CategoricalKey = keyof typeof CATEGORICAL_DIMENSIONS;

export type DescriptorCategory = "primary" | "secondary" | "tertiary";

export type DescriptorFamily = {
  family: string;
  category: DescriptorCategory;
  terms: string[];
};

/** A compact structured aroma/flavour lexicon, grouped in the conventional way. */
export const DESCRIPTOR_FAMILIES: DescriptorFamily[] = [
  { family: "Citrus", category: "primary", terms: ["Lemon", "Lime", "Grapefruit", "Orange peel"] },
  { family: "Orchard", category: "primary", terms: ["Green apple", "Pear", "Quince"] },
  { family: "Stone fruit", category: "primary", terms: ["Peach", "Apricot", "Nectarine"] },
  { family: "Tropical", category: "primary", terms: ["Pineapple", "Mango", "Passion fruit", "Lychee"] },
  { family: "Red fruit", category: "primary", terms: ["Strawberry", "Raspberry", "Red cherry", "Cranberry", "Redcurrant"] },
  { family: "Black fruit", category: "primary", terms: ["Blackberry", "Blackcurrant", "Black cherry", "Plum", "Blueberry"] },
  { family: "Dried fruit", category: "tertiary", terms: ["Fig", "Prune", "Raisin", "Dried apricot"] },
  { family: "Floral", category: "primary", terms: ["Violet", "Rose", "Blossom", "Elderflower", "Honeysuckle"] },
  { family: "Herbal", category: "primary", terms: ["Grass", "Bell pepper", "Mint", "Eucalyptus", "Dried herbs", "Tomato leaf"] },
  { family: "Spice", category: "primary", terms: ["Black pepper", "Liquorice", "Clove", "Cinnamon", "Anise"] },
  { family: "Mineral", category: "primary", terms: ["Flint", "Wet stone", "Chalk", "Saline", "Graphite"] },
  { family: "Oak", category: "secondary", terms: ["Vanilla", "Toast", "Smoke", "Cedar", "Coconut", "Coffee"] },
  { family: "Lees & malolactic", category: "secondary", terms: ["Brioche", "Biscuit", "Butter", "Cream", "Yeast"] },
  { family: "Developed", category: "tertiary", terms: ["Leather", "Tobacco", "Forest floor", "Mushroom", "Earth", "Honey", "Nutty", "Petrol", "Truffle"] },
];

export const ALL_DESCRIPTORS = DESCRIPTOR_FAMILIES.flatMap((f) => f.terms.map((t) => ({ term: t, family: f.family, category: f.category })));

export function descriptorCategory(term: string): DescriptorCategory | null {
  const hit = ALL_DESCRIPTORS.find((d) => d.term.toLowerCase() === term.toLowerCase());
  return hit?.category ?? null;
}

export const OBSERVATION_STATUS_LABEL: Record<ObservationStatus, string> = {
  assessed: "Assessed",
  unknown: "Unsure",
  absent: "None perceived",
  not_applicable: "Not applicable",
};
