import { expect, test } from "@playwright/test";
import { captureWine, signUp } from "./helpers";
import { setProvenance } from "./db";

test("a confirmed value completed from the reference catalog is labelled as such", async ({ page }) => {
  await signUp(page, "Catalog Taster");
  const wineId = await captureWine(page, { producer: "Château Margaux", name: "Pavillon Rouge", vintage: "2016", score: "8.0" });
  await setProvenance(wineId, "producer", { source: "provider", provider: "anthropic", confidence: 0.95, confirmedAt: "2026-10-19T00:00:00Z" });
  await setProvenance(wineId, "wineType", { source: "provider", provider: "catalog:wikidata", confidence: 0.86, confirmedAt: "2026-10-19T00:00:00Z" });
  await page.goto(`/wines/${wineId}`);
  await expect(page.getByText("From label · 95% · confirmed")).toBeVisible();
  const badge = page.getByText("From catalog · 86% · confirmed");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("title", /reference catalog \(wikidata\)/);

  await page.goto("/settings");
  await expect(page.getByText(/includes data from/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Wikidata" })).toHaveAttribute("href", "https://www.wikidata.org/");
});
