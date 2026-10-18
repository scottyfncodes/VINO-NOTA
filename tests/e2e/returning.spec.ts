import { expect, test } from "@playwright/test";
import { captureWine, signUp } from "./helpers";

test("a returning user signs back in, finds their journal and edits a tasting and a wine", async ({ page }) => {
  const email = await signUp(page, "Returning Taster");
  const wineId = await captureWine(page, { producer: "Clos Rougeard", name: "Le Bourg", vintage: "2014", score: "8.1" });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/journal");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjournal/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByText(/Le Bourg/).first()).toBeVisible();

  // Edit the tasting: the change persists and no second tasting appears.
  await page.goto(`/wines/${wineId}`);
  await page.getByRole("link", { name: "Edit", exact: true }).first().click();
  await expect(page).toHaveURL(/\/tastings\/[0-9a-f-]{36}\/edit/);
  await page.getByLabel("Score out of 10").fill("8.6");
  await page.getByLabel("Score out of 10").press("Enter");
  await page.getByRole("textbox", { name: /^Notes/ }).fill("Second look: graphite, firmer than remembered.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/wines/${wineId}`));
  await page.reload();
  // The new score shows on the tasting and in the wine's summary.
  await expect(page.locator("[aria-label='8.6 out of 10']")).toHaveCount(2);
  await expect(page.locator("[aria-label='8.1 out of 10']")).toHaveCount(0);
  await expect(page.getByText("Second look: graphite, firmer than remembered.")).toBeVisible();
  await expect(page.getByText("Tasting 1 of 1")).toBeVisible();

  // Edit the wine's identity: the change persists.
  await page.getByRole("link", { name: /Edit wine/ }).click();
  await page.getByRole("textbox", { name: /^Appellation/ }).fill("Saumur");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Wine details updated")).toBeVisible();
  await page.reload();
  const appellation = page.locator("dt", { hasText: "Appellation" }).locator("xpath=following-sibling::dd[1]");
  await expect(appellation).toContainText("Saumur");

  // The palate fingerprint's dot for this tasting is a full grid cell to tap, and reads correctly.
  await page.goto("/compendium");
  const dot = page.getByRole("link", { name: /^Body Medium: 1 tasting, mean score 8\.6 from 1 rated$/ });
  const box = (await dot.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(38);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await dot.click();
  await expect(page).toHaveURL(/\/journal\?ids=/);
  await expect(page.getByText(/Le Bourg/).first()).toBeVisible();
});

test("a very long wine name never widens the page on a 320px screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signUp(page);
  await page.goto("/capture");
  await page.getByRole("button", { name: /Skip the photo/ }).click();
  await page.getByRole("textbox", { name: /^Producer/ }).fill("Weingut Egon Müller-Scharzhof");
  await page.getByRole("textbox", { name: /^Wine name/ }).fill("Scharzhofberger Trockenbeerenauslese");
  await page.getByRole("textbox", { name: /^Vintage/ }).fill("2018");
  await page.getByText("White", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to tasting" }).click();
  await page.getByLabel("Score out of 10").fill("9.4");
  await page.getByLabel("Score out of 10").press("Enter");
  // The score header stays on one line at this width.
  const outOf = page.getByText("/ 10", { exact: true });
  expect((await outOf.boundingBox())!.height).toBeLessThan(30);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save to journal" }).click();
  await expect(page).toHaveURL(/\/wines\/[0-9a-f-]{36}/);
  const wineId = page.url().match(/\/wines\/([0-9a-f-]{36})/)![1];
  for (const path of [`/wines/${wineId}`, `/wines/${wineId}/edit`, `/wines/${wineId}/taste`, "/journal", "/journal?view=wines", "/"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const width = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(width, path).toEqual({ inner: 320, scroll: 320 });
  }
});
