import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { signUp } from "./helpers";

// The e2e server runs with EMAIL_TRANSPORT=outbox, which writes mail here instead of sending it.
const OUTBOX = path.join(__dirname, "..", "..", ".data", "outbox");

const RESET_SUBJECT = "Reset your Vino Nota password";

async function messagesTo(email: string, subject = RESET_SUBJECT) {
  const files = await readdir(OUTBOX).catch(() => [] as string[]);
  const messages = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(OUTBOX, f), "utf8")) as { to: string; subject: string; text: string }));
  return messages.filter((m) => m.to === email && m.subject === subject);
}

async function resetLinkFor(email: string) {
  await expect.poll(async () => (await messagesTo(email)).length, { timeout: 10_000 }).toBe(1);
  const [message] = await messagesTo(email);
  return message.text.match(/https?:\/\/\S+/)![0];
}

test("a forgotten password can be reset by email, signing out other sessions", async ({ page, browser }) => {
  const email = await signUp(page, "Forgetful Taster");

  const other = await browser.newContext();
  const reset = await other.newPage();
  await reset.goto("/sign-in");
  await reset.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(reset).toHaveURL(/\/forgot-password$/);
  await reset.getByLabel("Email").fill(email);
  await reset.getByRole("button", { name: "Send reset link" }).click();
  await expect(reset.getByText(/If an account uses that email, a reset link is on its way/)).toBeVisible();

  const link = await resetLinkFor(email);
  await reset.goto(link);
  await expect(reset).toHaveURL(/\/reset-password\?token=/);
  await reset.getByLabel("New password").fill("a-brand-new-password");
  await reset.getByRole("button", { name: "Change password" }).click();
  await expect(reset).toHaveURL(/\/sign-in\?reset=1$/);
  await expect(reset.getByText("Password changed. Sign in with your new password.")).toBeVisible();

  // The old password no longer works; the new one does.
  await reset.getByLabel("Email").fill(email);
  await reset.getByLabel("Password").fill("correct-horse-battery");
  await reset.getByRole("button", { name: "Sign in" }).click();
  await expect(reset.getByText("That email and password don't match an account.")).toBeVisible();
  await reset.getByLabel("Password").fill("a-brand-new-password");
  await reset.getByRole("button", { name: "Sign in" }).click();
  await expect(reset).toHaveURL(/\/$/);

  // The session that existed before the reset was revoked: its cookie is still sent, but the server rejects it.
  await page.goto("/journal");
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  // A reset link works only once. (Signed-in visitors are sent home, so drop the session first.)
  await other.clearCookies();
  await reset.goto(link);
  await expect(reset.getByText(/This reset link is invalid or has expired/)).toBeVisible();
  await other.close();
});

test("an unknown email gets the same answer and no message is sent", async ({ page }) => {
  const email = `nobody-${Date.now()}@example.test`;
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account uses that email, a reset link is on its way/)).toBeVisible();
  await page.waitForTimeout(500);
  expect(await messagesTo(email)).toHaveLength(0);
});
