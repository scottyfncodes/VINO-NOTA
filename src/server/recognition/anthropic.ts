import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { LabelRecognitionProvider, RecognitionCandidate, RecognitionIssue, RecognitionOutcome } from "./types";

const guess = <T extends z.ZodType>(value: T) => z.object({ value: value.nullable(), confidence: z.number() });

const LabelReading = z.object({
  is_wine_label: z.boolean(),
  extracted_text: z.string(),
  name: guess(z.string()),
  producer: guess(z.string()),
  vintage: guess(z.number().int()),
  is_non_vintage: guess(z.boolean()),
  wine_type: guess(z.enum(["red", "white", "rose", "sparkling", "orange", "dessert", "fortified", "other"])),
  country: guess(z.string()),
  region: guess(z.string()),
  subregion: guess(z.string()),
  appellation: guess(z.string()),
  grapes: guess(z.array(z.string())),
  alcohol_pct: guess(z.number()),
  issues: z.array(z.enum(["glare", "low_light", "blurry", "partial_label", "multiple_vintages", "multiple_bottles", "unreadable"])),
});

const SYSTEM = `You read wine labels for a private tasting journal. The user will review every field before anything is saved.

Report only what the photographed label itself shows or states. Do not use outside knowledge to fill in a field the label does not show (for example, do not add grape varieties, regions or a vintage that are not printed). It is far better to return null than to guess.

For each field return the value and a confidence between 0 and 1 that the value is exactly what the label states. Use null with confidence 0 when the label does not show it.

- extracted_text: the legible label text, line by line, transcribed as printed.
- name: the wine's own name or cuvée. If the label only names the producer and an appellation, use the appellation as the name.
- is_non_vintage: true only if the label says "NV", "non-vintage" or similar.
- country/region/subregion: use English names. Only fill region/subregion when printed (an appellation such as "Pauillac" may imply a region; only fill the region if it is printed too).
- wine_type: fill only when the label or obvious bottle cues make it clear (e.g. "Champagne", "Brut", "Rosé"); otherwise null.
- If more than one vintage year appears, set vintage to null and include "multiple_vintages" in issues.
- List any photo problems in issues. If this is not a wine label, set is_wine_label to false.`;

export class AnthropicLabelProvider implements LabelRecognitionProvider {
  readonly id = "anthropic";
  readonly displayName = "Claude vision";

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async recognize(image: { bytes: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" }): Promise<RecognitionOutcome> {
    if (!this.isConfigured()) return { status: "unavailable", reason: "Label recognition is not configured." };
    const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
    try {
      const response = await client.beta.messages.parse({
        model: process.env.RECOGNITION_MODEL || "claude-opus-5-5",
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(LabelReading) },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.bytes.toString("base64") } },
              { type: "text", text: "Read this wine label." },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal") return { status: "failed", reason: "The label couldn't be read automatically.", retryable: false };
      const r = response.parsed_output;
      if (!r) return { status: "failed", reason: "The label couldn't be read automatically.", retryable: true };
      return toOutcome(this.id, r);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return { status: "failed", reason: "Recognition is busy right now. Try again shortly, or enter the details yourself.", retryable: true };
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        console.error("[recognition] provider credentials rejected");
        return { status: "unavailable", reason: "Label recognition is temporarily unavailable." };
      }
      if (error instanceof Anthropic.APIError) {
        console.error(`[recognition] provider error ${error.status ?? "network"}`);
        return { status: "failed", reason: "Label recognition failed. You can retry or enter the details yourself.", retryable: true };
      }
      console.error("[recognition] unexpected failure");
      return { status: "failed", reason: "Label recognition failed. You can retry or enter the details yourself.", retryable: true };
    }
  }
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function field<T>(g: { value: T | null; confidence: number }): { value: T | null; confidence: number } {
  return g.value === null || g.value === "" ? { value: null, confidence: 0 } : { value: g.value, confidence: clamp(g.confidence) };
}

export function toOutcome(provider: string, r: z.infer<typeof LabelReading>): RecognitionOutcome {
  const issues: RecognitionIssue[] = [...new Set(r.issues)];
  if (!r.is_wine_label) issues.push("not_a_wine_label");
  const vintage = field(r.vintage);
  if (vintage.value !== null && (vintage.value < 1800 || vintage.value > 2100)) {
    vintage.value = null;
    vintage.confidence = 0;
  }
  if (issues.includes("multiple_vintages")) {
    vintage.value = null;
    vintage.confidence = 0;
  }
  const alcohol = field(r.alcohol_pct);
  if (alcohol.value !== null && (alcohol.value <= 0 || alcohol.value > 25)) {
    alcohol.value = null;
    alcohol.confidence = 0;
  }
  const candidate: RecognitionCandidate = {
    name: field(r.name),
    producer: field(r.producer),
    vintage,
    isNonVintage: field(r.is_non_vintage),
    wineType: field(r.wine_type),
    country: field(r.country),
    region: field(r.region),
    subregion: field(r.subregion),
    appellation: field(r.appellation),
    grapes: field(r.grapes.value && r.grapes.value.length ? r.grapes : { value: null, confidence: 0 }),
    alcoholPct: alcohol,
  };
  // Overall confidence reflects the identity-defining fields only.
  const core = [candidate.name.confidence, candidate.producer.confidence];
  const overall = r.is_wine_label ? core.reduce((a, b) => a + b, 0) / core.length : 0;
  return { status: "ok", provider, extractedText: r.extracted_text.slice(0, 4000), candidate, overallConfidence: overall, issues };
}
