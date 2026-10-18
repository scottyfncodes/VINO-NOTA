import { expect, test } from "@playwright/test";
import { captureWine, signUp } from "./helpers";

test("visitors are sent to sign-in and private APIs refuse them", async ({ page, request }) => {
  await page.goto("/journal");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjournal/);
  expect((await request.get("/api/export")).status()).toBe(401);
  expect((await request.post("/api/images")).status()).toBe(401);
});

test("capture → save → journal → second tasting → analysis → export", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("heading", { name: /begins with a single bottle/ })).toBeVisible();

  const wineId = await captureWine(page, { producer: "Domaine Huet", name: "Le Haut-Lieu Sec", vintage: "2019", score: "8.7", withPhoto: true, price: "42" });
  await expect(page.getByRole("heading", { level: 1, name: /Le Haut-Lieu Sec 2019/ })).toBeVisible();
  await expect(page.getByText("Quince and chalk.")).toBeVisible();
  await expect(page.locator("img[src^='/api/images/']").first()).toBeVisible();

  // Journal search finds it by producer and by region.
  await page.goto("/journal");
  await page.getByLabel("Search your journal").fill("huet");
  await expect(page.getByText("1 entry match")).toBeVisible();
  await page.getByLabel("Search your journal").fill("burgundy nonsense");
  await expect(page.getByRole("heading", { name: "Nothing matches" })).toBeVisible();

  // A second, separate tasting of the same wine.
  await page.goto(`/wines/${wineId}`);
  await page.getByRole("link", { name: "Record another tasting" }).click();
  await page.getByLabel("Score out of 10").fill("6.5");
  await page.getByLabel("Score out of 10").press("Enter");
  await page.getByRole("button", { name: "Save tasting" }).click();
  await expect(page).toHaveURL(new RegExp(`/wines/${wineId}`));
  await expect(page.getByText("Tasting 2 of 2")).toBeVisible();
  await expect(page.getByText("Tasting 1 of 2")).toBeVisible();
  await expect(page.locator("[aria-label='8.7 out of 10']")).toBeVisible();
  await expect(page.locator("[aria-label='6.5 out of 10']")).toBeVisible();

  // Capturing the same wine again offers to add to the existing record.
  await page.goto("/capture");
  await page.getByRole("button", { name: /Skip the photo/ }).click();
  await page.getByRole("textbox", { name: /^Producer/ }).fill("Huet");
  await page.getByRole("textbox", { name: /^Wine name/ }).fill("Le Haut-Lieu Sec");
  await page.getByRole("textbox", { name: /^Vintage/ }).fill("2019");
  await expect(page.getByText(/Add to Domaine Huet Le Haut-Lieu Sec 2019/)).toBeVisible();
  await expect(page.getByRole("radio", { name: /Add to Domaine Huet/ })).toBeChecked();
  await page.getByRole("link", { name: "Atlas" }).first().click();

  // Atlas and Compendium reflect only real records.
  await expect(page.getByText("Mean of 2 rated tastings")).toBeVisible();
  await page.goto("/compendium");
  await expect(page.getByRole("heading", { name: "Rating distribution" })).toBeVisible();
  await expect(page.getByText(/Fewer than five data points/).first()).toBeVisible();
  await page.getByText("View as a table").first().click();
  await expect(page.getByRole("cell", { name: "8–9" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Palate fingerprint" })).toBeVisible();

  // Export contains both tastings, scores and currency intact.
  const res = await page.request.get("/api/export?format=json");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.wines).toHaveLength(1);
  expect(data.tastings.map((t: { personalScore: number }) => t.personalScore).sort()).toEqual([6.5, 8.7]);
  expect(data.tastings.find((t: { personalScore: number }) => t.personalScore === 8.7).currency).toBe("USD");
  const csv = await page.request.get("/api/export?format=csv");
  expect((await csv.text()).trim().split("\r\n")).toHaveLength(3);
});

test("records are private to their owner over HTTP", async ({ browser }) => {
  const a = await browser.newContext();
  const pageA = await a.newPage();
  await signUp(pageA, "Owner");
  const wineId = await captureWine(pageA, { producer: "Private", name: "Secret Cuvée", vintage: "2020", score: "9", withPhoto: true });
  const imgSrc = await pageA.locator("img[src^='/api/images/']").first().getAttribute("src");

  const b = await browser.newContext();
  const pageB = await b.newPage();
  await signUp(pageB, "Intruder");
  // The page streams behind a loading boundary, so the "not found" view is checked by content.
  await pageB.goto(`/wines/${wineId}`);
  await expect(pageB.getByText("There’s no record here.")).toBeVisible();
  await expect(pageB.getByText("Secret Cuvée")).toHaveCount(0);
  expect((await pageB.request.get(imgSrc!)).status()).toBe(404);
  expect((await pageB.request.get(`/api/wines/${wineId}/export`)).status()).toBe(404);
  const exportB = await (await pageB.request.get("/api/export")).json();
  expect(exportB.wines).toHaveLength(0);
  await a.close();
  await b.close();
});

test("deleting a tasting and then the account requires confirmation", async ({ page }) => {
  await signUp(page);
  await captureWine(page, { producer: "Temp", name: "Deletable", vintage: "2021", score: "7" });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete this tasting?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete tasting" }).click();
  await expect(page.getByText("No tastings recorded for this wine yet.")).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account and all data" }).click();
  const confirm = page.getByRole("button", { name: "Delete everything" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await confirm.click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});
