import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db";
import { providerUsage } from "@/server/db/schema";
import { uploadImage } from "@/server/images";
import { setStorageForTesting } from "@/server/storage";
import {
  consumeGlobalRecognitionBudget,
  DEFAULT_GLOBAL_DAILY_LIMIT,
  GLOBAL_LIMIT_REASON,
  globalDailyLimit,
  recognizeLabel,
  setRecognitionProviderForTesting,
  type LabelRecognitionProvider,
} from "@/server/recognition";
import { createUser, sampleJpeg, useTempStorage } from "../support/fixtures";

let calls = 0;
const fake: LabelRecognitionProvider = {
  id: "fake",
  displayName: "Fake",
  isConfigured: () => true,
  recognize: async () => {
    calls++;
    return { status: "failed", reason: "test", retryable: true };
  },
};

// Each test uses its own (far future) UTC day so the shared global bucket never leaks between tests.
const day = (d: string, time = "12:00:00") => new Date(`${d}T${time}Z`);

beforeAll(() => {
  useTempStorage();
  setRecognitionProviderForTesting(fake);
});
afterEach(() => {
  calls = 0;
  vi.unstubAllEnvs();
});
afterAll(async () => {
  setStorageForTesting(null);
  setRecognitionProviderForTesting(undefined);
  await closeDb();
});

async function userWithPhoto(label: string) {
  const u = await createUser(label);
  const img = await uploadImage(u, await sampleJpeg(300, 400));
  return { u, imageId: img.id };
}

describe("global daily recognition limit", () => {
  it("defaults to a fixed number when unset and never means unlimited", () => {
    expect(globalDailyLimit({})).toBe(DEFAULT_GLOBAL_DAILY_LIMIT);
    expect(globalDailyLimit({ AI_GLOBAL_DAILY_LIMIT: "" })).toBe(DEFAULT_GLOBAL_DAILY_LIMIT);
    expect(globalDailyLimit({ AI_GLOBAL_DAILY_LIMIT: "50" })).toBe(50);
    expect(globalDailyLimit({ AI_GLOBAL_DAILY_LIMIT: "0" })).toBe(0);
    for (const bad of ["-5", "abc", "1.5", "Infinity"]) expect(globalDailyLimit({ AI_GLOBAL_DAILY_LIMIT: bad })).toBe(DEFAULT_GLOBAL_DAILY_LIMIT);
  });

  it("allows readings under the limit and blocks at the limit without calling the model", async () => {
    vi.stubEnv("AI_GLOBAL_DAILY_LIMIT", "2");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = day("2031-01-01");
    const a = await userWithPhoto("cap-a");
    const b = await userWithPhoto("cap-b");
    expect((await recognizeLabel(a.u, a.imageId, now)).status).toBe("failed"); // fake provider's own result
    expect((await recognizeLabel(b.u, b.imageId, now)).status).toBe("failed");
    expect(calls).toBe(2);
    const blocked = await recognizeLabel(a.u, a.imageId, now);
    expect(blocked).toEqual({ status: "failed", reason: GLOBAL_LIMIT_REASON, retryable: false });
    expect(calls).toBe(2);
    expect(GLOBAL_LIMIT_REASON).not.toContain("—");
    // The owner sees a server event with counts only, no user id.
    const logged = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes("global_daily_limit_reached"));
    expect(logged).toContain("limit=2");
    expect(logged).not.toContain(a.u);
    // The blocked attempt didn't count against the user's hourly limit.
    const [row] = await getDb()
      .select({ count: providerUsage.count })
      .from(providerUsage)
      .where(and(eq(providerUsage.key, `recognition:${a.u}`), eq(providerUsage.windowStart, day("2031-01-01", "12:00:00"))));
    expect(row.count).toBe(1);
    warn.mockRestore();
  });

  it("an env override of 0 pauses recognition", async () => {
    vi.stubEnv("AI_GLOBAL_DAILY_LIMIT", "0");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await userWithPhoto("cap-zero");
    expect(await recognizeLabel(a.u, a.imageId, day("2031-01-02"))).toMatchObject({ reason: GLOBAL_LIMIT_REASON });
    expect(calls).toBe(0);
    vi.mocked(console.warn).mockRestore();
  });

  it("still applies the per-user hourly limit under the global limit", async () => {
    vi.stubEnv("AI_GLOBAL_DAILY_LIMIT", "1000");
    const now = day("2031-01-03");
    const a = await userWithPhoto("cap-hourly");
    for (let i = 0; i < 30; i++) await recognizeLabel(a.u, a.imageId, now);
    expect(calls).toBe(30);
    const r = await recognizeLabel(a.u, a.imageId, now);
    expect(r.status === "failed" && r.reason).toMatch(/hourly limit/);
    expect(calls).toBe(30);
  });

  it("starts a fresh budget at midnight UTC", async () => {
    vi.stubEnv("AI_GLOBAL_DAILY_LIMIT", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await userWithPhoto("cap-rollover");
    await recognizeLabel(a.u, a.imageId, day("2031-01-04", "23:58:00"));
    expect(await recognizeLabel(a.u, a.imageId, day("2031-01-04", "23:59:59"))).toMatchObject({ reason: GLOBAL_LIMIT_REASON });
    expect(calls).toBe(1);
    await recognizeLabel(a.u, a.imageId, day("2031-01-05", "00:00:01"));
    expect(calls).toBe(2);
    vi.mocked(console.warn).mockRestore();
  });

  it("never lets parallel requests past the limit", async () => {
    const now = day("2031-01-06");
    const results = await Promise.all(Array.from({ length: 25 }, () => consumeGlobalRecognitionBudget(now, 7)));
    expect(results.filter(Boolean)).toHaveLength(7);
    const [row] = await getDb()
      .select({ count: providerUsage.count })
      .from(providerUsage)
      .where(and(eq(providerUsage.key, "global:recognition"), eq(providerUsage.windowStart, day("2031-01-06", "00:00:00"))));
    expect(row.count).toBe(7);
  });
});
