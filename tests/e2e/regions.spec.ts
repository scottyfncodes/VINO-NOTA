import { expect, test } from "@playwright/test";
import { captureWine, signUp } from "./helpers";

const WORLD = "0 0 960 470";
const box = (viewBox: string | null) => (viewBox ?? "").split(" ").map(Number);

test("the Regions map opens on the whole world with no records, then frames what is recorded and can be moved by hand", async ({ page }) => {
  await signUp(page);
  await page.goto("/regions");
  const map = page.locator('figure svg[role="group"]');
  await expect(page.getByText("No origins recorded yet")).toBeVisible();
  await expect(map).toHaveAttribute("viewBox", WORLD);

  await captureWine(page, { name: "Le Haut-Lieu", producer: "Domaine Huet", vintage: "2019", score: "8.6" });
  await page.goto("/regions");
  // One country in France: a regional view, much tighter than the world but not hard against the border.
  const [, , width, height] = box(await map.getAttribute("viewBox"));
  expect(width).toBeLessThan(960 / 2);
  expect(width).toBeGreaterThanOrEqual(960 * 0.2);
  expect(height).toBeLessThan(470);
  await expect(map.getByRole("link", { name: /^France/ })).toBeVisible();
  const fitted = await map.getAttribute("viewBox");

  // Manual zoom and reset.
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(box(await map.getAttribute("viewBox"))[2]).toBeLessThan(width);
  await page.getByRole("button", { name: "Your records" }).click();
  await expect(map).toHaveAttribute("viewBox", fitted!);
  await page.getByRole("button", { name: "Whole world" }).click();
  await expect(map).toHaveAttribute("viewBox", WORLD);
  await page.getByRole("button", { name: "Your records" }).click();

  // The controls are touch-sized and the page still does not scroll sideways.
  for (const name of ["Zoom in", "Zoom out"]) {
    const b = await page.getByRole("button", { name }).boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // The gazetteer still lists what was recorded: framing changes the view, not the records.
  await expect(page.getByRole("heading", { name: "France" })).toBeVisible();
  await expect(page.getByText("Loire").first()).toBeVisible();
});
