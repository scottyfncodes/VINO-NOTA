import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("primary navigation reaches all five destinations", async ({ page }) => {
  await signUp(page);
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  for (const [label, heading] of [
    ["Journal", "Journal"],
    ["Record", "Record a tasting"],
    ["Compendium", "Compendium"],
    ["Regions", "Regions"],
    ["Atlas", /begins with a single bottle/],
  ] as const) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
  // No horizontal scrolling at this width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("navigation targets are large enough to tap", async ({ page }) => {
  await signUp(page);
  const links = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const box = await links.nth(i).boundingBox();
    if (box && box.width > 0) expect(Math.min(box.height, box.width)).toBeGreaterThanOrEqual(40);
  }
});
