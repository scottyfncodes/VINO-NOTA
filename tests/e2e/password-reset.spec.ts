import { expect, test, type Browser, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expireResetLinks } from "./db";
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

/** Requests a reset link from a separate, signed-out browser and returns it. */
async function requestResetLink(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account uses that email, a reset link is on its way/)).toBeVisible();
  await context.close();
  return resetLinkFor(email);
}

async function expectSignInWorks(browser: Browser, email: string, password: string, works: boolean) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (works) await expect(page).toHaveURL(/\/$/);
  else await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
  await context.close();
}

async function expectSignedIn(page: Page, signedIn: boolean) {
  await page.goto("/journal");
  if (signedIn) await expect(page).toHaveURL(/\/journal$/);
  else await expect(page).toHaveURL(/\/sign-in(\?|$)/);
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

  // A reset link works only once, and saying so doesn't depend on being signed out.
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

test("a signed-in visitor who opens their reset link sees the form, not the app", async ({ page, browser }) => {
  const email = await signUp(page, "Signed-in Taster");
  const link = await requestResetLink(browser, email);

  // The phone case: the link opens in a browser that is still signed in.
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password").fill("a-signed-in-new-password");
  await page.getByRole("button", { name: "Change password" }).click();

  // The reset revoked this browser's session too, so it lands on sign-in with the confirmation.
  await expect(page).toHaveURL(/\/sign-in\?reset=1$/);
  await expect(page.getByText("Password changed. Sign in with your new password.")).toBeVisible();
  await expectSignedIn(page, false);
  await expectSignInWorks(browser, email, "correct-horse-battery", false);
  await expectSignInWorks(browser, email, "a-signed-in-new-password", true);

  // Signed in again, the used link says it's no longer valid instead of redirecting.
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-signed-in-new-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(link);
  await expect(page.getByText(/This reset link is invalid or has expired/)).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveCount(0);
});

test("an expired reset link is refused for a signed-in visitor, and the password is unchanged", async ({ page, browser }) => {
  const email = await signUp(page, "Late Taster");
  const link = await requestResetLink(browser, email);
  await expireResetLinks(email);

  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password\?error=INVALID_TOKEN/);
  await expect(page.getByText(/This reset link is invalid or has expired/)).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveCount(0);
  await expectSignedIn(page, true);
  await expectSignInWorks(browser, email, "correct-horse-battery", true);
});

test("a reset link opened while signed in as someone else changes only the linked account", async ({ page, browser }) => {
  await signUp(page, "Current Taster");
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const otherEmail = await signUp(otherPage, "Linked Taster");
  const link = await requestResetLink(browser, otherEmail);

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password").fill("the-linked-new-password");
  await page.getByRole("button", { name: "Change password" }).click();

  // The signed-in account keeps its session (sign-in sends it home); the linked account's sessions are revoked.
  await expect(page).toHaveURL(/\/$/);
  await expectSignedIn(page, true);
  await expectSignedIn(otherPage, false);
  await expectSignInWorks(browser, otherEmail, "correct-horse-battery", false);
  await expectSignInWorks(browser, otherEmail, "the-linked-new-password", true);
  await otherContext.close();
});

test("signed-in visitors are still sent home from sign-in, sign-up and forgot-password", async ({ page }) => {
  await signUp(page, "Settled Taster");
  for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/$/);
  }
  // …but the reset page stays reachable, showing the invalid-link notice without a token.
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByText(/This reset link is invalid or has expired/)).toBeVisible();
});
