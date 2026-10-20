"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui/primitives";
import s from "./auth.module.css";

const UNREACHABLE = "We couldn't reach the server. Check your connection and try again.";

export function ForgotPasswordForm({ available }: { available: boolean }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (result.error?.status === 429) {
        setError("Too many requests. Please wait a while and try again.");
      } else if (result.error) {
        setError("We couldn't send a reset link just now. Please try again.");
      } else {
        // The same message whether or not an account exists, so this page can't be used to check addresses.
        setSent(true);
      }
    } catch {
      setError(UNREACHABLE);
    }
    setBusy(false);
  }

  return (
    <form className={s.card} onSubmit={onSubmit}>
      <h2 className={s.cardTitle}>Reset your password</h2>
      {!available ? (
        <Notice tone="info">Password reset by email isn&rsquo;t set up on this server yet.</Notice>
      ) : sent ? (
        <Notice tone="success" role="status">
          If an account uses that email, a reset link is on its way. It works once and expires in an hour.
        </Notice>
      ) : (
        <>
          <p className={s.fine}>Enter the email you signed up with and we&rsquo;ll send a link to choose a new password.</p>
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="primary" block disabled={busy} aria-busy={busy}>
            {busy ? "One moment…" : "Send reset link"}
          </Button>
        </>
      )}
      <p className={s.switch}>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(!token);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
    try {
      const result = await authClient.resetPassword({ newPassword, token });
      if (!result.error) {
        router.replace("/sign-in?reset=1");
        return;
      }
      if (result.error.status === 429) setError("Too many attempts. Please wait a minute and try again.");
      else if (result.error.code === "INVALID_TOKEN") setExpired(true);
      else setError(result.error.message ?? "We couldn't change your password.");
    } catch {
      setError(UNREACHABLE);
    }
    setBusy(false);
  }

  return (
    <form className={s.card} onSubmit={onSubmit}>
      <h2 className={s.cardTitle}>Choose a new password</h2>
      {expired ? (
        <Notice tone="warning">
          This reset link is invalid or has expired. <Link href="/forgot-password">Request a new one</Link>.
        </Notice>
      ) : (
        <>
          <Field id="password" label="New password" hint="At least 10 characters. You'll be signed out everywhere else.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="primary" block disabled={busy} aria-busy={busy}>
            {busy ? "One moment…" : "Change password"}
          </Button>
        </>
      )}
      <p className={s.switch}>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </form>
  );
}
