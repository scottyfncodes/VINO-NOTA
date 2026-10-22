"use client";

import { useState } from "react";
import { deleteAccountAction, signOutAction, updatePreferencesAction } from "@/app/actions";
import { CURRENCIES } from "@/lib/domain/currency";
import { authClient } from "@/lib/auth-client";
import { VERIFY_CALLBACK_PATH } from "@/server/auth/emails";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button, Field, Notice, Select } from "@/components/ui/primitives";

export function CurrencyPreference({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      style={{ display: "grid", gap: "var(--space-3)", maxWidth: "22rem" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await updatePreferencesAction({ defaultCurrency: value }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
        setBusy(false);
        setStatus(r.ok ? { tone: "success", text: "Saved." } : { tone: "error", text: r.error });
      }}
    >
      <Field id="pref-currency" label="Default currency for new tastings" hint="Prices are always stored in the currency you choose for each tasting.">
        <Select id="pref-currency" value={value} onChange={(e) => setValue(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <div>
        <Button type="submit" disabled={busy || value === initial}>
          Save preference
        </Button>
      </div>
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
    </form>
  );
}

export function EmailVerification({ email, verified, canSend, linkResult }: { email: string; verified: boolean; canSend: boolean; linkResult: "verified" | "invalid" | null }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setStatus(null);
    try {
      const r = await authClient.sendVerificationEmail({ email, callbackURL: VERIFY_CALLBACK_PATH });
      setStatus(
        !r.error
          ? { tone: "success", text: `A confirmation link is on its way to ${email}. It expires in 24 hours.` }
          : r.error.status === 429
            ? { tone: "error", text: "Too many requests. Please wait a while and try again." }
            : { tone: "error", text: "We couldn't send the email just now. Please try again." },
      );
    } catch {
      setStatus({ tone: "error", text: "Couldn't reach the server." });
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {linkResult === "verified" && verified && (
        <Notice tone="success" role="status">
          Email confirmed. Thank you.
        </Notice>
      )}
      {linkResult === "invalid" && <Notice tone="warning">That confirmation link is invalid or has expired.{canSend && !verified ? " Send a new one below." : ""}</Notice>}
      <p style={{ fontSize: "var(--text-sm)" }}>
        <span className="muted">Email: </span>
        {verified ? "Confirmed" : "Not confirmed yet"}
      </p>
      {!verified && canSend && (
        <div>
          <Button onClick={send} disabled={busy} aria-busy={busy}>
            {busy ? "One moment…" : "Send confirmation email"}
          </Button>
        </div>
      )}
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
    </div>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" icon="signout">
        Sign out
      </Button>
    </form>
  );
}

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" icon="trash" onClick={() => setOpen(true)}>
        Delete account and all data
      </Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} title="Delete your account?" confirmLabel="Delete everything" requirePhrase="DELETE" onConfirm={() => deleteAccountAction("DELETE")}>
        <p>
          This permanently deletes the account <strong>{email}</strong>, every wine, tasting, observation and photo. It cannot be undone. Download an export first if you want a copy.
        </p>
      </ConfirmDialog>
    </>
  );
}
