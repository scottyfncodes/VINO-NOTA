import { expect, test } from "@playwright/test";
import { captureWine, signUp } from "./helpers";

test("invalid capture and edit fields are brought into view and focused", async ({ page }) => {
  await signUp(page);
  const wineId = await captureWine(page, { producer: "Focus", name: "Advanced", vintage: "2020", score: "7" });

  // Wine type has no single id: the first type option takes focus.
  await page.goto("/capture");
  await page.getByRole("button", { name: /Skip the photo/ }).click();
  await page.getByRole("textbox", { name: /^Wine name/ }).fill("Focus test");
  await page.getByRole("button", { name: "Continue to tasting" }).click();
  await expect(page.getByText("Choose the wine's type.")).toBeVisible();
  await expect(page.locator('input[name="wineType"]').first()).toBeFocused();

  // An error inside the collapsed "Advanced observations" section opens it and focuses the field.
  await page.goto(`/wines/${wineId}/taste`);
  await page.getByText("Advanced observations").click();
  await page.getByLabel("Serving temp. °C").fill("99");
  await page.getByText("Advanced observations").click();
  await expect(page.getByLabel("Serving temp. °C")).toBeHidden();
  await page.getByRole("button", { name: "Save tasting" }).click();
  const temp = page.getByLabel("Serving temp. °C");
  await expect(temp).toBeFocused();
  await expect(temp).toBeInViewport();
  await expect(temp).toHaveAttribute("aria-describedby", "temp-error");
  await expect(page.getByText("Use a temperature between −5 and 40 °C.")).toBeVisible();
});

test("journal controls are touch-sized and don't trigger iOS focus zoom", async ({ page }) => {
  await signUp(page);
  await captureWine(page, { producer: "Touch", name: "Targets", vintage: "2021", score: "8" });
  await page.goto("/journal");
  const sort = page.getByLabel("Sort by");
  expect(await sort.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  for (const name of ["List view", "Grid view"]) {
    const box = await page.getByRole("link", { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("field hints are announced with their inputs", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel("Password")).toHaveAttribute("aria-describedby", "password-hint");
  await expect(page.locator("#password-hint")).toHaveText("At least 10 characters.");
});
