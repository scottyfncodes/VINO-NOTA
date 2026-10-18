"use client";

import { useState } from "react";
import { deleteAccountAction, signOutAction, updatePreferencesAction } from "@/app/actions";
import { CURRENCIES } from "@/lib/domain/currency";
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
