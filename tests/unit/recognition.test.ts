import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicLabelProvider, MAX_RETRIES, REQUEST_TIMEOUT_MS, toOutcome } from "@/server/recognition/anthropic";

const g = <T,>(value: T | null, confidence = 0.9) => ({ value, confidence });
const base = {
  is_wine_label: true,
  extracted_text: "CHÂTEAU EXAMPLE\n2015\n2016",
  name: g("Grand Vin"),
  producer: g("Château Example"),
  vintage: g(2015),
  is_non_vintage: g(false),
  wine_type: g("red" as const),
  country: g("France"),
  region: g(null as string | null, 0),
  subregion: g(null as string | null, 0),
  appellation: g("Margaux"),
  grapes: g([] as string[]),
  alcohol_pct: g(13.5),
  issues: [] as ("glare" | "multiple_vintages")[],
};

describe("recognition output normalisation", () => {
  it("drops the vintage when the label shows several", () => {
    const r = toOutcome("test", { ...base, issues: ["multiple_vintages"] });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.candidate.vintage).toEqual({ value: null, confidence: 0 });
  });
  it("discards implausible values and empty grape lists", () => {
    const r = toOutcome("test", { ...base, vintage: g(3015), alcohol_pct: g(80) });
    if (r.status !== "ok") throw new Error();
    expect(r.candidate.vintage.value).toBeNull();
    expect(r.candidate.alcoholPct.value).toBeNull();
    expect(r.candidate.grapes.value).toBeNull();
  });
  it("flags non-labels with zero overall confidence", () => {
    const r = toOutcome("test", { ...base, is_wine_label: false });
    if (r.status !== "ok") throw new Error();
    expect(r.overallConfidence).toBe(0);
    expect(r.issues).toContain("not_a_wine_label");
  });
  it("clamps confidences into 0..1", () => {
    const r = toOutcome("test", { ...base, name: g("X", 7) });
    if (r.status !== "ok") throw new Error();
    expect(r.candidate.name.confidence).toBe(1);
  });
});

describe("Anthropic label provider request and failure handling", () => {
  const reading = { ...base, extracted_text: "SECRET LABEL TEXT", grapes: g(["Chenin Blanc"]) };
  const okResponse = { model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 5200, output_tokens: 610 }, parsed_output: reading };
  function fakeClient(respond: (params: Record<string, unknown>) => unknown) {
    const calls: Record<string, unknown>[] = [];
    const client = { beta: { messages: { parse: async (params: Record<string, unknown>) => (calls.push(params), respond(params)) } } } as unknown as Anthropic;
    return { client, calls };
  }
  const image = { bytes: Buffer.from("jpeg-bytes"), mediaType: "image/jpeg" as const };
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
    vi.restoreAllMocks();
  });

  it("sends one request with the label image, structured output and refusal fallback", async () => {
    const { client, calls } = fakeClient(async () => okResponse);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const r = await new AnthropicLabelProvider(() => client).recognize(image);
    expect(calls).toHaveLength(1);
    const p = calls[0] as { model: string; max_tokens: number; betas: string[]; fallbacks: unknown; output_config: { effort: string; format: unknown }; messages: { content: { type: string; source?: { type: string; media_type: string; data: string } }[] }[] };
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.max_tokens).toBe(16000);
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.fallbacks).toBe("default");
    expect(p.output_config.effort).toBe("low");
    expect(p.output_config.format).toBeTruthy();
    expect(p.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from("jpeg-bytes").toString("base64") } });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.candidate.producer.value).toBe("Château Example");
      expect(r.candidate.grapes.value).toEqual(["Chenin Blanc"]);
    }
    // Usage is logged as token counts only — never the label's content.
    expect(log).toHaveBeenCalledWith("[recognition] model=claude-opus-5-5 stop=end_turn in=5200 out=610");
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET LABEL TEXT");
  });

  it("makes no call and reports unavailable without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { client, calls } = fakeClient(async () => okResponse);
    expect((await new AnthropicLabelProvider(() => client).recognize(image)).status).toBe("unavailable");
    expect(calls).toHaveLength(0);
  });

  it("treats a refusal as final and a truncated answer as retryable", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const refused = await new AnthropicLabelProvider(() => fakeClient(async () => ({ ...okResponse, stop_reason: "refusal", parsed_output: null })).client).recognize(image);
    expect(refused).toMatchObject({ status: "failed", retryable: false });
    const truncated = await new AnthropicLabelProvider(() => fakeClient(async () => ({ ...okResponse, stop_reason: "max_tokens", parsed_output: null })).client).recognize(image);
    expect(truncated).toMatchObject({ status: "failed", retryable: true });
  });

  it("maps API failures to honest, actionable states without leaking details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failWith = (e: Error) => new AnthropicLabelProvider(() => fakeClient(async () => Promise.reject(e)).client).recognize(image);
    expect(await failWith(new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers()))).toMatchObject({ status: "failed", retryable: true, reason: expect.stringContaining("busy") });
    expect(await failWith(new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()))).toEqual({ status: "unavailable", reason: "Label recognition is temporarily unavailable." });
    expect(await failWith(new Anthropic.InternalServerError(529, undefined, "overloaded", new Headers()))).toMatchObject({ status: "failed", retryable: true });
    expect(await failWith(new Anthropic.APIConnectionTimeoutError({ message: "timeout" }))).toMatchObject({ status: "failed", retryable: true });
  });

  it("keeps every attempt inside the recognise route's time limit", () => {
    const route = readFileSync("src/app/api/recognize/route.ts", "utf8");
    const maxDuration = Number(route.match(/export const maxDuration = (\d+)/)![1]);
    expect(REQUEST_TIMEOUT_MS * (MAX_RETRIES + 1)).toBeLessThan(maxDuration * 1000);
  });
});
