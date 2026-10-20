import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { signUp } from "./helpers";

// The e2e server runs with EMAIL_TRANSPORT=outbox, which writes mail here instead of sending it.
const OUTBOX = path.join(__dirname, "..", "..", ".data", "outbox");
const SUBJECT = "Confirm your email for Vino Nota";

async function confirmationsTo(email: string) {
  const files = await readdir(OUTBOX).catch(() => [] as string[]);
  const messages = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(OUTBOX, f), "utf8")) as { to: string; subject: string; text: string }));
  return messages.filter((m) => m.to === email && m.subject === SUBJECT);
}

test("sign-up sends a confirmation link that marks the email confirmed", async ({ page }) => {
  const email = await signUp(page, "Confirming Taster");
  await expect.poll(async () => (await confirmationsTo(email)).length, { timeout: 10_000 }).toBe(1);

  await page.goto("/settings");
  await expect(page.getByText("Not confirmed yet")).toBeVisible();

  const [message] = await confirmationsTo(email);
  await page.goto(message.text.match(/https?:\/\/\S+/)![0]);
  await expect(page).toHaveURL(/\/settings\?verify=done$/);
  await expect(page.getByText("Email confirmed. Thank you.")).toBeVisible();
  await expect(page.getByText(/^Email:\s*Confirmed$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send confirmation email" })).toHaveCount(0);
});

test("an unconfirmed account can request another link, and a bad link says so", async ({ page }) => {
  const email = await signUp(page, "Resending Taster");
  await expect.poll(async () => (await confirmationsTo(email)).length, { timeout: 10_000 }).toBe(1);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Send confirmation email" }).click();
  await expect(page.getByText(`A confirmation link is on its way to ${email}.`, { exact: false })).toBeVisible();
  await expect.poll(async () => (await confirmationsTo(email)).length, { timeout: 10_000 }).toBe(2);

  await page.goto("/api/auth/verify-email?token=not-a-real-token&callbackURL=%2Fsettings%3Fverify%3Ddone");
  await expect(page).toHaveURL(/\/settings\?verify=done&error=/);
  await expect(page.getByText("That confirmation link is invalid or has expired.", { exact: false })).toBeVisible();
  await expect(page.getByText("Not confirmed yet")).toBeVisible();
});
