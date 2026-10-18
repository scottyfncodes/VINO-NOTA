import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const LABEL = path.join(__dirname, "fixtures", "label.jpg");

export async function signUp(page: Page, name = "E2E Taster") {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto("/sign-up");
  await page.getByRole("textbox", { name: /^Name/ }).fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);
  return email;
}

export async function captureWine(page: Page, opts: { name: string; producer: string; vintage: string; score: string; withPhoto?: boolean; price?: string }) {
  await page.goto("/capture");
  if (opts.withPhoto) {
    await page.locator('input[type="file"]').nth(1).setInputFiles(LABEL);
  } else {
    await page.getByRole("button", { name: /Skip the photo/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Confirm the wine" })).toBeVisible();
  await page.getByRole("textbox", { name: /^Producer/ }).fill(opts.producer);
  await page.getByRole("textbox", { name: /^Wine name/ }).fill(opts.name);
  await page.getByRole("textbox", { name: /^Vintage/ }).fill(opts.vintage);
  await page.getByText("White", { exact: true }).click();
  await page.getByRole("combobox", { name: /^Country/ }).selectOption("FR");
  await page.getByRole("textbox", { name: /^Region/ }).fill("Loire");
  await page.getByRole("button", { name: "Continue to tasting" }).click();
  await expect(page.getByRole("heading", { name: "Record the tasting" })).toBeVisible();
  await page.getByLabel("Score out of 10").fill(opts.score);
  await page.getByLabel("Score out of 10").press("Enter");
  await page.getByLabel("Body: Medium", { exact: true }).check({ force: true });
  await page.getByLabel("Acidity: High").check({ force: true });
  await page.getByRole("textbox", { name: /^Overall impression/ }).fill("Quince and chalk.");
  if (opts.price) await page.getByRole("textbox", { name: /^Price paid/ }).fill(opts.price);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review and save" })).toBeVisible();
  await page.getByRole("button", { name: "Save to journal" }).click();
  await expect(page).toHaveURL(/\/wines\/[0-9a-f-]{36}/);
  await expect(page.getByText("Saved to your journal")).toBeVisible();
  return page.url().match(/\/wines\/([0-9a-f-]{36})/)![1];
}
