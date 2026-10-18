import { z } from "zod";
import { CATEGORICAL_DIMENSIONS, STRUCTURAL_DIMENSIONS } from "./sensory";
import { WINE_TYPES } from "./wine";
import { parseScore } from "./score";

const trimmed = (max: number) =>
  z
    .string()
    .max(max, `Must be ${max} characters or fewer.`)
    .transform((v) => v.trim().replace(/[ \t]+/g, " "));

const optionalText = (max: number) =>
  z
    .union([trimmed(max), z.null()])
    .transform((v) => (v && v.length ? v : null))
    .default(null);

const optionalNumber = (min: number, max: number, label: string) =>
  z
    .union([z.number(), z.string(), z.null()])
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label} must be between ${min} and ${max}.` });
        return z.NEVER;
      }
      return n;
    })
    .default(null);

const provenanceSchema = z.object({
  source: z.enum(["user", "provider", "inferred"]),
  provider: z.string().max(60).optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmedAt: z.string().max(40).optional(),
});

export const grapeInputSchema = z.object({
  name: trimmed(80).refine((v) => v.length > 0, "Grape name is required."),
  percentage: optionalNumber(0.01, 100, "Grape share"),
});

const PROVENANCE_FIELDS = ["name", "producer", "vintage", "wineType", "country", "region", "subregion", "appellation", "alcoholPct", "grapes"] as const;

export const wineInputSchema = z
  .object({
    name: trimmed(200).refine((v) => v.length > 0, "Wine name is required."),
    producer: optionalText(200),
    vintage: z
      .union([z.number().int(), z.string(), z.null()])
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isInteger(n) || n < 1800 || n > 2100) {
          ctx.addIssue({ code: "custom", message: "Vintage must be a year between 1800 and 2100." });
          return z.NEVER;
        }
        return n;
      })
      .default(null),
    isNonVintage: z.boolean().default(false),
    wineType: z.enum(WINE_TYPES.map((t) => t.value) as [string, ...string[]]),
    country: z
      .union([z.string().regex(/^[A-Z]{2}$/), z.literal(""), z.null()])
      .transform((v) => (v ? v : null))
      .default(null),
    region: optionalText(120),
    subregion: optionalText(120),
    appellation: optionalText(160),
    alcoholPct: optionalNumber(0, 25, "Alcohol"),
    grapes: z.array(grapeInputSchema).max(15).default([]),
    provenance: z.partialRecord(z.enum(PROVENANCE_FIELDS), provenanceSchema).default({}),
  })
  .superRefine((w, ctx) => {
    if (w.isNonVintage && w.vintage !== null) {
      ctx.addIssue({ code: "custom", path: ["vintage"], message: "A non-vintage wine cannot have a vintage year." });
    }
    if ((w.region || w.subregion) && !w.country) {
      ctx.addIssue({ code: "custom", path: ["country"], message: "Choose a country for this region." });
    }
    if (w.subregion && !w.region) {
      ctx.addIssue({ code: "custom", path: ["region"], message: "Add the broader region for this sub-region." });
    }
    const seen = new Set<string>();
    let total = 0;
    for (const g of w.grapes) {
      const key = g.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: ["grapes"], message: `${g.name} is listed twice.` });
      }
      seen.add(key);
      total += g.percentage ?? 0;
    }
    if (total > 100.5) {
      ctx.addIssue({ code: "custom", path: ["grapes"], message: "Grape shares add up to more than 100%." });
    }
  });

export type WineInput = z.output<typeof wineInputSchema>;
export type WineInputRaw = z.input<typeof wineInputSchema>;

const structuralKeys = STRUCTURAL_DIMENSIONS.map((d) => d.key);
const categoricalKeys = Object.keys(CATEGORICAL_DIMENSIONS);
export const DESCRIPTOR_DIMENSIONS = ["aroma", "flavor"] as const;

export const observationInputSchema = z
  .object({
    dimension: z.string().max(40),
    status: z.enum(["assessed", "unknown", "absent", "not_applicable"]),
    value: z.number().int().min(1).max(5).nullable().default(null),
    descriptor: optionalText(60),
    category: z.enum(["primary", "secondary", "tertiary"]).nullable().default(null),
    intensity: z.number().int().min(1).max(5).nullable().default(null),
  })
  .superRefine((o, ctx) => {
    const isStructural = structuralKeys.includes(o.dimension);
    const isCategorical = categoricalKeys.includes(o.dimension);
    const isDescriptor = (DESCRIPTOR_DIMENSIONS as readonly string[]).includes(o.dimension);
    if (!isStructural && !isCategorical && !isDescriptor) {
      ctx.addIssue({ code: "custom", message: `Unknown sensory dimension "${o.dimension}".` });
      return;
    }
    if (o.status !== "assessed") {
      if (o.value !== null || o.descriptor !== null) {
        ctx.addIssue({ code: "custom", message: "Only assessed observations carry a value." });
      }
      return;
    }
    if (isStructural && o.value === null) {
      ctx.addIssue({ code: "custom", message: `${o.dimension} needs a value from 1 to 5.` });
    }
    if ((isCategorical || isDescriptor) && !o.descriptor) {
      ctx.addIssue({ code: "custom", message: `${o.dimension} needs a descriptor.` });
    }
  });

export type ObservationInput = z.output<typeof observationInputSchema>;

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export const tastingInputSchema = z
  .object({
    tastedOn: z.string().refine(isoDate, "Choose a valid tasting date."),
    personalScore: z
      .union([z.number(), z.string(), z.null()])
      .transform((v, ctx) => {
        const r = parseScore(v);
        if (!r.ok) {
          ctx.addIssue({ code: "custom", message: r.error });
          return z.NEVER;
        }
        return r.value;
      })
      .default(null),
    purchasePrice: optionalNumber(0, 1_000_000, "Price"),
    currency: z
      .union([z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."), z.literal(""), z.null()])
      .transform((v) => (v ? v : null))
      .default(null),
    priceBasis: z
      .union([z.enum(["retail_bottle", "restaurant_bottle", "glass"]), z.literal(""), z.null()])
      .transform((v) => (v ? v : null))
      .default(null),
    venue: optionalText(160),
    occasion: optionalText(160),
    foodPairing: optionalText(200),
    wouldBuyAgain: z.boolean().nullable().default(null),
    blindStatus: z.enum(["not_blind", "blind_unrevealed", "blind_revealed"]).default("not_blind"),
    blindGuess: optionalText(300),
    impression: optionalText(300),
    notes: optionalText(10_000),
    servingTempC: optionalNumber(-5, 40, "Serving temperature"),
    decantMinutes: optionalNumber(0, 2880, "Decanting time").transform((v) => (v === null ? null : Math.round(v))),
    bottleProvenance: optionalText(300),
    storageNotes: optionalText(300),
    observations: z.array(observationInputSchema).max(80).default([]),
    tags: z
      .array(trimmed(40))
      .max(20)
      .default([])
      .transform((tags) => [...new Set(tags.map((t) => t.toLowerCase()).filter(Boolean))]),
  })
  .superRefine((t, ctx) => {
    if (t.purchasePrice !== null && !t.currency) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose the currency for this price." });
    }
    const year = Number(t.tastedOn.slice(0, 4));
    if (year < 1900) ctx.addIssue({ code: "custom", path: ["tastedOn"], message: "Tasting date is too far in the past." });
    // Allow one day of slack for time zones ahead of the server.
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    if (t.tastedOn > tomorrow) ctx.addIssue({ code: "custom", path: ["tastedOn"], message: "Tasting date cannot be in the future." });
    const single = new Set<string>();
    for (const o of t.observations) {
      if ((DESCRIPTOR_DIMENSIONS as readonly string[]).includes(o.dimension)) continue;
      if (single.has(o.dimension)) {
        ctx.addIssue({ code: "custom", path: ["observations"], message: `${o.dimension} is recorded more than once.` });
      }
      single.add(o.dimension);
    }
  });

export type TastingInput = z.output<typeof tastingInputSchema>;
export type TastingInputRaw = z.input<typeof tastingInputSchema>;

/** Flatten zod issues into a user-presentable message list. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => i.message);
}
