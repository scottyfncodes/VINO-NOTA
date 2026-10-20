"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui/primitives";
import s from "./auth.module.css";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthForm({ mode, resetAvailable = false }: { mode: "sign-in" | "sign-up"; resetAvailable?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "").trim() || email.split("@")[0] });
      if (result.error) {
        const status = result.error.status;
        setError(
          status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : mode === "sign-in"
              ? "That email and password don't match an account."
              : (result.error.message ?? "We couldn't create that account."),
        );
        setBusy(false);
        return;
      }
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form className={s.card} onSubmit={onSubmit} noValidate={false}>
      <h2 className={s.cardTitle}>{mode === "sign-in" ? "Open your journal" : "Begin a journal"}</h2>
      {mode === "sign-in" && params.get("reset") === "1" && (
        <Notice tone="success" role="status">
          Password changed. Sign in with your new password.
        </Notice>
      )}
      {mode === "sign-up" && (
        <Field id="name" label="Name" optional>
          <Input id="name" name="name" autoComplete="name" maxLength={80} />
        </Field>
      )}
      <Field id="email" label="Email">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required />
      </Field>
      <Field id="password" label="Password" hint={mode === "sign-up" ? "At least 10 characters." : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={mode === "sign-up" ? 10 : undefined}
          maxLength={128}
          required
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" block disabled={busy} aria-busy={busy}>
        {busy ? "One moment…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
      {mode === "sign-in" && resetAvailable && (
        <p className={s.switch}>
          <Link href="/forgot-password">Forgot your password?</Link>
        </p>
      )}
      <p className={s.switch}>
        {mode === "sign-in" ? (
          <>
            New to Vino Nota? <Link href="/sign-up">Create an account</Link>
          </>
        ) : (
          <>
            Already keeping a journal? <Link href="/sign-in">Sign in</Link>
          </>
        )}
      </p>
      <p className={s.fine}>Your journal is private. Records are visible only to you and can be exported or deleted at any time.</p>
    </form>
  );
}
