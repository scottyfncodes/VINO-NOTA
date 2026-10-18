/**
 * Label recognition boundary. A provider turns a label photo into:
 *  1. text it could read on the label (extractedText), and
 *  2. a candidate identity with per-field confidence.
 * Nothing here is ever saved without the user reviewing and confirming it.
 */

export type FieldGuess<T> = { value: T | null; confidence: number };

export type RecognitionCandidate = {
  name: FieldGuess<string>;
  producer: FieldGuess<string>;
  vintage: FieldGuess<number>;
  isNonVintage: FieldGuess<boolean>;
  wineType: FieldGuess<string>;
  country: FieldGuess<string>;
  region: FieldGuess<string>;
  subregion: FieldGuess<string>;
  appellation: FieldGuess<string>;
  grapes: FieldGuess<string[]>;
  alcoholPct: FieldGuess<number>;
};

export type RecognitionIssue = "glare" | "low_light" | "blurry" | "partial_label" | "multiple_vintages" | "multiple_bottles" | "not_a_wine_label" | "unreadable";

export type RecognitionOutcome =
  | {
      status: "ok";
      provider: string;
      extractedText: string;
      candidate: RecognitionCandidate;
      overallConfidence: number;
      issues: RecognitionIssue[];
    }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string; retryable: boolean };

export interface LabelRecognitionProvider {
  readonly id: string;
  readonly displayName: string;
  isConfigured(): boolean;
  recognize(image: { bytes: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" }): Promise<RecognitionOutcome>;
}

export const ISSUE_LABEL: Record<RecognitionIssue, string> = {
  glare: "Glare is obscuring part of the label",
  low_light: "The photo is quite dark",
  blurry: "The photo is blurred",
  partial_label: "Only part of the label is visible",
  multiple_vintages: "More than one vintage appears on the label",
  multiple_bottles: "More than one bottle is in frame",
  not_a_wine_label: "This doesn't look like a wine label",
  unreadable: "The label text couldn't be read",
};
