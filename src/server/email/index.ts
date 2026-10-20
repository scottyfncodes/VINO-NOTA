import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Transactional email. Messages go through Resend's HTTP API when RESEND_API_KEY
 * and EMAIL_FROM are set; without them, features that need email (password
 * reset) stay switched off rather than half-working.
 *
 * EMAIL_TRANSPORT=outbox writes messages to ./.data/outbox instead. It exists only
 * for local end-to-end test servers and is refused on Vercel.
 *
 * Message bodies, links and API keys are never logged or included in errors.
 */

export type EmailMessage = { to: string; subject: string; text: string; html: string };
type Env = Record<string, string | undefined>;
type Transport = "resend" | "outbox";

export const OUTBOX_DIR = path.join(process.cwd(), ".data", "outbox");

export function emailTransport(env: Env = process.env): Transport | null {
  if (env.EMAIL_TRANSPORT === "outbox") return env.VERCEL ? null : "outbox";
  return env.RESEND_API_KEY && env.EMAIL_FROM ? "resend" : null;
}

export function emailConfigured(env: Env = process.env): boolean {
  return emailTransport(env) !== null;
}

export async function sendEmail(message: EmailMessage, deps: { env?: Env; fetchImpl?: typeof fetch } = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const transport = emailTransport(env);
  if (transport === "outbox") {
    await mkdir(OUTBOX_DIR, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    await writeFile(path.join(OUTBOX_DIR, name), JSON.stringify(message));
    return;
  }
  if (transport !== "resend") throw new Error("Email is not configured.");
  const response = await (deps.fetchImpl ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
}
