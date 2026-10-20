import type { EmailMessage } from "@/server/email";

/** How long a password-reset link stays valid, in seconds. */
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;

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
