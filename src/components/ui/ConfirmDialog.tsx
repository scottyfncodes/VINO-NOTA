"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, Input, Notice } from "./primitives";

/**
 * Confirmation for destructive actions. Optionally requires typing a phrase.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  requirePhrase,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  requirePhrase?: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string } | void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !requirePhrase || phrase.trim().toUpperCase() === requirePhrase.toUpperCase();

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await onConfirm();
      if (r && !r.ok) setError(r.error ?? "That didn't work. Please try again.");
    } catch (e) {
      // Navigation after success throws a redirect; let it propagate.
      if (e && typeof e === "object" && "digest" in e) throw e;
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) {
          setPhrase("");
          setError(null);
          onClose();
        }
      }}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="dangerSolid" onClick={confirm} disabled={!ready || busy} aria-busy={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        {children}
        {requirePhrase && (
          <Field id="confirm-phrase" label={`Type ${requirePhrase} to confirm`}>
            <Input id="confirm-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </Field>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Sheet>
  );
}
