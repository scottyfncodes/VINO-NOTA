"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createTastingAction, findMatchesAction, updateTastingAction, updateWineAction } from "@/app/actions";
import type { DuplicateCandidate } from "@/server/catalog/wines";
import type { TastingInputRaw, WineInputRaw } from "@/lib/domain/validation";
import { todayLocalISO } from "@/lib/format";
import { Button, ButtonLink, Notice } from "@/components/ui/primitives";
import { clearDraft, emptyTasting, identityFromWine, identityToPayload, readDraft, repeatTasting, tastingFromInput, tastingToPayload, writeDraft, type IdentityDraft, type IdentityField, type TastingDraft } from "./drafts";
import { IdentityForm, validateIdentity } from "./IdentityForm";
import { TastingForm, validateTasting } from "./TastingForm";
import s from "./capture.module.css";

function ErrorBox({ error }: { error: { message: string; details?: string[] } | null }) {
  if (!error) return null;
  return (
    <Notice tone="error" title="Not saved">
      {error.message}
      {error.details && error.details.length > 1 && (
        <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "1.1em" }}>
          {error.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </Notice>
  );
}

/** Edit an existing tasting, or record a new one for a known wine. */
export function TastingEditor({
  mode,
  wineId,
  wineType,
  tastingId,
  initial,
  repeatFrom,
  defaultCurrency,
}: {
  mode: "new" | "edit";
  wineId: string;
  wineType: string;
  tastingId?: string;
  initial?: TastingInputRaw;
  repeatFrom?: TastingInputRaw;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const draftKey = mode === "new" ? `vino-nota:tasting-draft:${wineId}` : `vino-nota:tasting-edit:${tastingId}`;
  // Rendered client-only, so a saved draft can seed state directly.
  const [boot] = useState(() => {
    const today = todayLocalISO();
    const saved = readDraft<{ savedAt: number; draft: TastingDraft }>(draftKey);
    if (saved && Date.now() - saved.savedAt < 7 * 86_400_000) return { today, draft: saved.draft, restored: true };
    const draft = initial
      ? tastingFromInput(initial, defaultCurrency)
      : repeatFrom
        ? repeatTasting(tastingFromInput(repeatFrom, defaultCurrency), today)
        : emptyTasting(today, defaultCurrency);
    return { today, draft, restored: false };
  });
  const today = boot.today;
  const [draft, setDraft] = useState<TastingDraft>(boot.draft);
  const [errors, setErrors] = useState<ReturnType<typeof validateTasting>>({});
  const [saveError, setSaveError] = useState<{ message: string; details?: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(boot.restored);

  useEffect(() => {
    writeDraft(draftKey, { savedAt: Date.now(), draft });
  }, [draft, draftKey]);

  async function save() {
    const e = validateTasting(draft, today);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setSaveError(null);
    const payload = tastingToPayload(draft);
    const result = await (mode === "new" ? createTastingAction(wineId, payload) : updateTastingAction(tastingId!, payload)).catch(() => ({
      ok: false as const,
      error: "We couldn't reach the server. Your changes are kept on this device.",
    }));
    if (result.ok) {
      clearDraft(draftKey);
      const id = "tastingId" in result.data ? result.data.tastingId : tastingId;
      router.push(`/wines/${wineId}?saved=${id}#tasting-${id}`);
      router.refresh();
      return;
    }
    setSaving(false);
    setSaveError({ message: result.error, details: "details" in result ? result.details : undefined });
  }

  return (
    <div>
      {restored && (
        <div className={s.restored}>
          <Notice tone="info" title="Unsaved changes restored">
            <button
              type="button"
              onClick={() => {
                clearDraft(draftKey);
                setRestored(false);
                setDraft(initial ? tastingFromInput(initial, defaultCurrency) : emptyTasting(today, defaultCurrency));
              }}
              style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", textDecoration: "underline" }}
            >
              Discard them
            </button>
          </Notice>
        </div>
      )}
      <TastingForm value={draft} onChange={setDraft} wineType={wineType} today={today} errors={errors} />
      <div style={{ marginTop: "var(--space-5)" }}>
        <ErrorBox error={saveError} />
      </div>
      <div className={s.actionBar}>
        <ButtonLink variant="ghost" href={`/wines/${wineId}`}>
          Cancel
        </ButtonLink>
        <Button variant="primary" onClick={save} disabled={saving} aria-busy={saving}>
          {saving ? "Saving…" : mode === "new" ? "Save tasting" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

/** Edit a wine's identity. Shows probable duplicates that can be merged from the wine page. */
export function WineEditor({ wineId, initial }: { wineId: string; initial: WineInputRaw }) {
  const router = useRouter();
  const [draft, setDraft] = useState<IdentityDraft>(() => identityFromWine(initial));
  const [errors, setErrors] = useState<Partial<Record<IdentityField, string>>>({});
  const [saveError, setSaveError] = useState<{ message: string; details?: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState<DuplicateCandidate[]>([]);

  useEffect(() => {
    if (!draft.name.trim()) return;
    const h = window.setTimeout(async () => {
      const found = await findMatchesAction(
        { name: draft.name, producer: draft.producer || null, vintage: draft.vintage ? Number(draft.vintage) : null, isNonVintage: draft.isNonVintage },
        wineId,
      ).catch(() => []);
      setDupes(found.filter((m) => m.match === "same_wine"));
    }, 450);
    return () => window.clearTimeout(h);
  }, [draft.name, draft.producer, draft.vintage, draft.isNonVintage, wineId]);

  async function save() {
    const e = validateIdentity(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setSaveError(null);
    const result = await updateWineAction(wineId, identityToPayload(draft)).catch(() => ({ ok: false as const, error: "We couldn't reach the server. Please try again." }));
    if (result.ok) {
      router.push(`/wines/${wineId}?updated=1`);
      router.refresh();
      return;
    }
    setSaving(false);
    setSaveError({ message: result.error, details: "details" in result ? result.details : undefined });
  }

  return (
    <div>
      <IdentityForm value={draft} onChange={setDraft} errors={errors} />
      {dupes.length > 0 && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <Notice tone="warning" title="This now matches another record">
            {dupes.map((d) => [d.producer, d.name, d.vintage].filter(Boolean).join(" ")).join("; ")}. After saving, you can merge the two from the wine&rsquo;s page.
          </Notice>
        </div>
      )}
      <div style={{ marginTop: "var(--space-5)" }}>
        <ErrorBox error={saveError} />
      </div>
      <div className={s.actionBar}>
        <ButtonLink variant="ghost" href={`/wines/${wineId}`}>
          Cancel
        </ButtonLink>
        <Button variant="primary" onClick={save} disabled={saving} aria-busy={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
