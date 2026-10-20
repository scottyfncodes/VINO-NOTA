import type { EmailMessage } from "@/server/email";

/** How long a password-reset link stays valid, in seconds. */
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;
/** How long an email-verification link stays valid, in seconds. */
export const VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60;
/** Where a verification link lands; Better Auth appends &error=… when the link is bad. */
export const VERIFY_CALLBACK_PATH = "/settings?verify=done";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function passwordResetEmail(to: string, url: string): EmailMessage {
  const subject = "Reset your Vino Nota password";
  const text = [
    "Someone asked to reset the password for your Vino Nota journal.",
    "",
    "Choose a new password here (the link works once and expires in an hour):",
    url,
    "",
    "If this wasn't you, ignore this email; your password stays the same.",
  ].join("\n");
  const link = escapeHtml(url);
  const html =
    `<p>Someone asked to reset the password for your Vino Nota journal.</p>` +
    `<p><a href="${link}">Choose a new password</a>. The link works once and expires in an hour.</p>` +
    `<p>If this wasn't you, ignore this email; your password stays the same.</p>`;
  return { to, subject, text, html };
}

export function verificationEmail(to: string, url: string): EmailMessage {
  const subject = "Confirm your email for Vino Nota";
  const text = [
    "Confirm that this is the email address for your Vino Nota journal:",
    url,
    "",
    "The link expires in 24 hours. If you didn't create a Vino Nota journal, ignore this email.",
  ].join("\n");
  const html =
    `<p><a href="${escapeHtml(url)}">Confirm that this is the email address for your Vino Nota journal</a>.</p>` +
    `<p>The link expires in 24 hours. If you didn't create a Vino Nota journal, ignore this email.</p>`;
  return { to, subject, text, html };
}
