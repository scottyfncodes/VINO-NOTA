import { describe, expect, it } from "vitest";
import { passwordResetEmail, RESET_TOKEN_TTL_SECONDS, verificationEmail, VERIFY_CALLBACK_PATH, VERIFY_TOKEN_TTL_SECONDS } from "@/server/auth/emails";
import { emailConfigured, emailTransport, sendEmail } from "@/server/email";

const resend = { RESEND_API_KEY: "re_test_secret", EMAIL_FROM: "Vino Nota <journal@example.test>" };
const message = { to: "taster@example.test", subject: "Hello", text: "Plain", html: "<p>Plain</p>" };

describe("emailTransport", () => {
  it("is off without a provider, so reset stays disabled", () => {
    expect(emailTransport({})).toBeNull();
    expect(emailConfigured({ RESEND_API_KEY: "re_x" })).toBe(false);
    expect(emailConfigured({ EMAIL_FROM: "a@example.test" })).toBe(false);
  });
  it("uses Resend when both the key and the sender are set", () => {
    expect(emailTransport(resend)).toBe("resend");
  });
  it("allows the test outbox locally but never on Vercel", () => {
    expect(emailTransport({ EMAIL_TRANSPORT: "outbox" })).toBe("outbox");
    expect(emailTransport({ EMAIL_TRANSPORT: "outbox", VERCEL: "1" })).toBeNull();
    expect(emailTransport({ ...resend, EMAIL_TRANSPORT: "outbox", VERCEL: "1" })).toBeNull();
  });
});

describe("sendEmail", () => {
  it("posts the message to Resend", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await sendEmail(message, { env: resend, fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer re_test_secret");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: resend.EMAIL_FROM, to: [message.to], subject: "Hello", text: "Plain", html: "<p>Plain</p>" });
  });
  it("reports provider failures without echoing the key or the message", async () => {
    const fetchImpl = (async () => new Response("denied re_test_secret", { status: 403 })) as unknown as typeof fetch;
    const error = await sendEmail(message, { env: resend, fetchImpl }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Email provider returned HTTP 403.");
    expect((error as Error).message).not.toMatch(/re_test_secret|taster@/);
  });
  it("refuses to send when nothing is configured", async () => {
    await expect(sendEmail(message, { env: {} })).rejects.toThrow("Email is not configured.");
  });
});

describe("passwordResetEmail", () => {
  it("links to the reset URL, says when it expires and escapes the HTML", () => {
    const url = "https://vino.example/api/auth/reset-password/tok?callbackURL=%2Freset-password&x=<y>";
    const email = passwordResetEmail("taster@example.test", url);
    expect(email.to).toBe("taster@example.test");
    expect(email.text).toContain(url);
    expect(email.text).toMatch(/expires in an hour/);
    expect(email.html).toContain("&amp;x=&lt;y&gt;");
    expect(email.html).not.toContain("<y>");
    expect(RESET_TOKEN_TTL_SECONDS).toBe(3600);
  });
});

describe("verificationEmail", () => {
  it("links to the confirmation URL, says when it expires and escapes the HTML", () => {
    const url = "https://vino.example/api/auth/verify-email?token=t&callbackURL=%2Fsettings%3Fverify%3Ddone&x=<y>";
    const email = verificationEmail("taster@example.test", url);
    expect(email.subject).toBe("Confirm your email for Vino Nota");
    expect(email.text).toContain(url);
    expect(email.text).toMatch(/expires in 24 hours/);
    expect(email.html).toContain("&amp;x=&lt;y&gt;");
    expect(email.html).not.toContain("<y>");
    expect(VERIFY_TOKEN_TTL_SECONDS).toBe(86400);
    expect(VERIFY_CALLBACK_PATH).toBe("/settings?verify=done");
  });
});
