import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { setExternalIds, setGrapes, setProvenance, snapshot, sql } from "./db";

const label = { source: "provider", provider: "anthropic", confidence: 0.91, confirmedAt: "2026-10-01T10:00:00.000Z" };

test.afterAll(async () => {
  await sql.end();
});

/** Records a wine through Capture. `vintage` is a year, "NV", or "" for unknown. */
async function capture(page: Page, opts: { producer: string; name: string; vintage: string; score: string; asNewRecord?: boolean }) {
  await page.goto("/capture");
  await page.getByRole("button", { name: /Skip the photo/ }).click();
  await page.getByRole("textbox", { name: /^Producer/ }).fill(opts.producer);
  await page.getByRole("textbox", { name: /^Wine name/ }).fill(opts.name);
  if (opts.vintage === "NV") await page.getByLabel("Non-vintage (NV)").check();
  else if (opts.vintage) await page.getByRole("textbox", { name: /^Vintage/ }).fill(opts.vintage);
  await page.getByText("Red", { exact: true }).click();
  if (opts.asNewRecord) {
    // Capture offers to add to the existing record; keep a separate (duplicate) one.
    await page.getByText("Create a new wine record").click();
    await expect(page.getByRole("radio", { name: /Create a new wine record/ })).toBeChecked();
  }
  await page.getByRole("button", { name: "Continue to tasting" }).click();
  await page.getByLabel("Score out of 10").fill(opts.score);
  await page.getByLabel("Score out of 10").press("Enter");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save to journal" }).click();
  await expect(page).toHaveURL(/\/wines\/[0-9a-f-]{36}/);
  return page.url().match(/\/wines\/([0-9a-f-]{36})/)![1];
}

async function openMergeDialog(page: Page, targetId: string) {
  await page.goto(`/wines/${targetId}`);
  await expect(page.getByRole("heading", { name: "Possible duplicate" })).toBeVisible();
  await page.getByRole("button", { name: "Merge into this record" }).click();
  const dialog = page.getByRole("dialog", { name: "Merge duplicate records?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("merging a compatible duplicate keeps grapes, provenance and every tasting", async ({ page }) => {
  await signUp(page);
  const target = await capture(page, { producer: "Merge House", name: "Compatible", vintage: "2019", score: "8" });
  const source = await capture(page, { producer: "Merge House", name: "Compatible", vintage: "2019", score: "6", asNewRecord: true });
  await setGrapes(source, [
    { name: "Syrah", percentage: 85, source: "provider" },
    { name: "Viognier", percentage: 15, source: "provider" },
  ]);
  await setProvenance(source, "grapes", label);
  await setExternalIds(target, { lwin: "1012345" });
  await setExternalIds(source, { vivino: "88" });

  const dialog = await openMergeDialog(page, target);
  await dialog.getByRole("button", { name: "Merge records" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("heading", { name: "Possible duplicate" })).toBeHidden();
  await expect(page.getByText("Tasting 1 of 2")).toBeVisible();
  await expect(page.getByText("Tasting 2 of 2")).toBeVisible();
  await expect(page.locator("[aria-label='8.0 out of 10']")).toBeVisible();
  await expect(page.locator("[aria-label='6.0 out of 10']")).toBeVisible();
  const grapes = page.locator("dt", { hasText: "Grapes" }).locator("xpath=following-sibling::dd[1]");
  await expect(grapes).toContainText("Syrah 85%, Viognier 15%");
  await expect(grapes).toContainText("From label · 91% · confirmed");

  const [row] = await sql`select external_ids from wine where id = ${target}`;
  expect(row.external_ids).toEqual({ lwin: "1012345", vivino: "88" });
  await page.goto(`/wines/${source}`);
  await expect(page.getByRole("heading", { name: "There’s no record here." })).toBeVisible();
});

test("different vintages, and non-vintage versus unknown, are never offered for merging", async ({ page }) => {
  await signUp(page);
  const y2015 = await capture(page, { producer: "Vintage House", name: "Years", vintage: "2015", score: "7" });
  await capture(page, { producer: "Vintage House", name: "Years", vintage: "2016", score: "7" });
  const nv = await capture(page, { producer: "Vintage House", name: "States", vintage: "NV", score: "7" });
  const unknown = await capture(page, { producer: "Vintage House", name: "States", vintage: "", score: "7" });
  for (const id of [y2015, nv, unknown]) {
    await page.goto(`/wines/${id}`);
    await expect(page.getByRole("heading", { name: "Tastings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Possible duplicate" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Merge into this record" })).toHaveCount(0);
  }
  // Control: a second record of unknown vintage is the same identity, so it is offered.
  await capture(page, { producer: "Vintage House", name: "States", vintage: "", score: "6", asNewRecord: true });
  await page.goto(`/wines/${unknown}`);
  await expect(page.getByRole("heading", { name: "Possible duplicate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Merge into this record" })).toHaveCount(1);
});

test("refused merges explain why, stay usable on a narrow screen and change nothing", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signUp(page);
  const cases: { name: string; arrange: (target: string, source: string) => Promise<void>; message: RegExp }[] = [
    {
      name: "Shares",
      arrange: async (t, s) => {
        await setGrapes(t, [{ name: "Merlot", percentage: 60 }]);
        await setGrapes(s, [{ name: "Merlot", percentage: 70 }, { name: "Malbec", percentage: 30 }]);
      },
      message: /Merlot is 60% on this record but 70% on the duplicate\. Correct one record, then merge\./,
    },
    {
      name: "Origins",
      arrange: async (t, s) => {
        await setGrapes(t, [{ name: "Merlot", percentage: null }]);
        await setGrapes(s, [{ name: "Malbec", percentage: null, source: "provider" }]);
        await setProvenance(s, "grapes", label);
      },
      message: /grapes on these records came from different sources.*Make them agree on one record, then merge\./,
    },
    {
      name: "Identifiers",
      arrange: async (t, s) => {
        await setExternalIds(t, { lwin: "1" });
        await setExternalIds(s, { lwin: "2" });
      },
      message: /different lwin identifiers, so they may not be the same wine/,
    },
  ];

  for (const c of cases) {
    const target = await capture(page, { producer: "Refusal House", name: c.name, vintage: "2020", score: "8" });
    const source = await capture(page, { producer: "Refusal House", name: c.name, vintage: "2020", score: "5", asNewRecord: true });
    await c.arrange(target, source);
    const before = await snapshot(target, source);

    const dialog = await openMergeDialog(page, target);
    await dialog.getByRole("button", { name: "Merge records" }).click();
    const error = dialog.getByRole("alert");
    await expect(error).toHaveText(c.message);
    await expect(error).toBeInViewport();
    const box = await error.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Merge records" })).toBeEnabled();

    expect(await snapshot(target, source)).toEqual(before);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.goto(`/wines/${source}`);
    await expect(page.getByText("Tasting 1 of 1")).toBeVisible();
  }
});
