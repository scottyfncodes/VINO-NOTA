"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findMatchesAction, saveCaptureAction } from "@/app/actions";
import { countryName } from "@/lib/domain/countries";
import { formatScore } from "@/lib/domain/score";
import { wineTypeLabel } from "@/lib/domain/wine";
import { formatDate, plural, todayLocalISO } from "@/lib/format";
import type { DuplicateCandidate } from "@/server/catalog/wines";
import { ISSUE_LABEL, type RecognitionOutcome } from "@/server/recognition/types";
import { Icon } from "@/components/ui/Icon";
import { Button, Notice } from "@/components/ui/primitives";
import { WineThumb } from "@/components/wine/display";
import {
  applyCandidate,
  clearDraft,
  DRAFT_KEY,
  emptyIdentity,
  emptyTasting,
  identityToPayload,
  readDraft,
  tastingToPayload,
  writeDraft,
  type IdentityDraft,
  type IdentityField,
  type Suggestion,
  type TastingDraft,
} from "./drafts";
import { IdentityForm, validateIdentity } from "./IdentityForm";
import { prepareImage, uploadPhoto } from "./prepareImage";
import { TastingForm, validateTasting } from "./TastingForm";
import s from "./capture.module.css";

type Step = "photo" | "identify" | "taste" | "review";
const STEPS: { key: Step; label: string }[] = [
  { key: "photo", label: "Label" },
  { key: "identify", label: "Identity" },
  { key: "taste", label: "Tasting" },
  { key: "review", label: "Save" },
];

type Recognition =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; outcome: Extract<RecognitionOutcome, { status: "ok" }> }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string; retryable: boolean };

type SavedDraft = {
  v: 1;
  savedAt: number;
  step: Step;
  imageId: string | null;
  identity: IdentityDraft;
  tasting: TastingDraft;
  matchChoice: string;
  confirmed: boolean;
  recognition: Recognition;
};

export function Steps({ step }: { step: Step }) {
  const idx = STEPS.findIndex((x) => x.key === step);
  return (
    <ol className={s.steps} aria-label="Progress" role="list">
      {STEPS.map((x, i) => (
        <li key={x.key} className={s.stepPip} data-state={i < idx ? "done" : i === idx ? "current" : "todo"} aria-current={i === idx ? "step" : undefined}>
          {x.label}
        </li>
      ))}
    </ol>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const word = value >= 0.85 ? "High" : value >= 0.6 ? "Moderate" : "Low";
  return (
    <div className={s.confidence}>
      <div className={s.confidenceTrack} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Match confidence">
        <div className={s.confidenceFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.confidenceLabel}>
        {word} confidence · {pct}%
      </span>
    </div>
  );
}

export function CaptureFlow({ recognitionAvailable, providerName, defaultCurrency }: { recognitionAvailable: boolean; providerName: string | null; defaultCurrency: string }) {
  const router = useRouter();
  // Rendered client-only, so the saved draft can seed state directly.
  const [boot] = useState(() => {
    const today = todayLocalISO();
    const saved = readDraft<SavedDraft>(DRAFT_KEY);
    const draft = saved && saved.v === 1 && Date.now() - saved.savedAt < 7 * 86_400_000 ? saved : null;
    return { today, draft };
  });
  const today = boot.today;
  const d0 = boot.draft;
  const [step, setStep] = useState<Step>(d0 ? (d0.step === "review" ? "taste" : d0.step) : "photo");
  const [imageId, setImageId] = useState<string | null>(d0?.imageId ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<{ status: "idle" | "preparing" | "uploading" | "error"; error?: string }>({ status: "idle" });
  const [identity, setIdentity] = useState<IdentityDraft>(() => d0?.identity ?? emptyIdentity());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [tasting, setTasting] = useState<TastingDraft>(() => d0?.tasting ?? emptyTasting(today, defaultCurrency));
  const [recognition, setRecognition] = useState<Recognition>(() => (!d0 || d0.recognition.status === "running" ? { status: "idle" } : d0.recognition));
  const [matches, setMatches] = useState<DuplicateCandidate[]>([]);
  const [matchChoice, setMatchChoice] = useState<string>(d0?.matchChoice ?? "new");
  const [confirmed, setConfirmed] = useState(d0?.confirmed ?? false);
  const [identityErrors, setIdentityErrors] = useState<Partial<Record<IdentityField, string>>>({});
  const [tastingErrors, setTastingErrors] = useState<ReturnType<typeof validateTasting>>({});
  const [saveError, setSaveError] = useState<{ message: string; details?: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(d0?.savedAt ?? null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const userChoseMatch = useRef(Boolean(d0));

  // Autosave on every change.
  useEffect(() => {
    const pristine = !imageId && !identity.name && !identity.producer && tasting.score === null && !tasting.notes && step === "photo";
    if (pristine) return;
    const draft: SavedDraft = { v: 1, savedAt: Date.now(), step, imageId, identity, tasting, matchChoice, confirmed, recognition };
    writeDraft(DRAFT_KEY, draft);
  }, [step, imageId, identity, tasting, matchChoice, confirmed, recognition]);

  // Look for this wine among the user's existing records.
  useEffect(() => {
    if (!identity.name.trim()) return;
    const handle = window.setTimeout(async () => {
      try {
        const found = await findMatchesAction({
          name: identity.name,
          producer: identity.producer || null,
          vintage: identity.vintage ? Number(identity.vintage) : null,
          isNonVintage: identity.isNonVintage,
        });
        setMatches(found);
        const same = found.find((m) => m.match === "same_wine");
        if (!userChoseMatch.current) setMatchChoice(same ? same.id : "new");
        else if (matchChoice !== "new" && !found.some((m) => m.id === matchChoice && m.match === "same_wine")) setMatchChoice("new");
      } catch {
        setMatches([]);
      }
    }, 450);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.name, identity.producer, identity.vintage, identity.isNonVintage]);

  const go = useCallback((next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  const runRecognition = useCallback(
    async (id: string) => {
      if (!recognitionAvailable) {
        setRecognition({ status: "unavailable", reason: "Automatic label reading isn't set up for this journal, so please enter the details from the label." });
        return;
      }
      setRecognition({ status: "running" });
      try {
        const res = await fetch("/api/recognize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: id }) });
        const outcome = (await res.json()) as RecognitionOutcome | { error: string };
        if (!res.ok || "error" in outcome) {
          setRecognition({ status: "failed", reason: "error" in outcome ? outcome.error : "Label reading failed.", retryable: true });
          return;
        }
        if (outcome.status === "ok") {
          setRecognition({ status: "done", outcome });
          setIdentity((current) => {
            const merged = applyCandidate(current, outcome.candidate, outcome.provider);
            setSuggestions(merged.suggestions);
            return merged.draft;
          });
          setConfirmed(false);
        } else if (outcome.status === "unavailable") {
          setRecognition({ status: "unavailable", reason: outcome.reason });
        } else {
          setRecognition({ status: "failed", reason: outcome.reason, retryable: outcome.retryable });
        }
      } catch {
        setRecognition({ status: "failed", reason: "We couldn't reach the label reader. Your entries are safe — retry or continue by hand.", retryable: true });
      }
    },
    [recognitionAvailable],
  );

  async function onFile(file: File | undefined, source: "camera" | "user_upload") {
    if (!file) return;
    setPhotoState({ status: "preparing" });
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    try {
      const blob = await prepareImage(file);
      setPhotoState({ status: "uploading" });
      const id = await uploadPhoto(blob, { source });
      setImageId(id);
      setPhotoState({ status: "idle" });
      setRecognition({ status: "idle" });
      go("identify");
      void runRecognition(id);
    } catch (e) {
      setPhotoState({ status: "error", error: e instanceof Error ? e.message : "The photo couldn't be used." });
    }
  }

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Matches only apply while there is a name to match on.
  const visibleMatches = identity.name.trim() ? matches : [];
  const providerFieldCount = Object.keys(identity.fromProvider).length;
  const sameWine = visibleMatches.find((m) => m.id === matchChoice);

  function continueFromIdentity() {
    const errors = validateIdentity(identity);
    if (sameWine) {
      // Adding to an existing record: identity fields are not saved, so don't block on them.
      setIdentityErrors({});
      go("taste");
      return;
    }
    setIdentityErrors(errors);
    if (Object.keys(errors).length) {
      document.getElementById(Object.keys(errors)[0] === "name" ? "wine-name" : Object.keys(errors)[0])?.focus();
      return;
    }
    if (providerFieldCount > 0 && !confirmed) {
      document.getElementById("confirm-identity")?.focus();
      return;
    }
    go("taste");
  }

  function continueFromTasting() {
    const errors = validateTasting(tasting, today);
    setTastingErrors(errors);
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      document.getElementById(first === "tastedOn" ? "tasted-on" : first === "price" ? "price" : first)?.focus();
      return;
    }
    go("review");
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const confirmedAt = new Date().toISOString();
    const outcome = recognition.status === "done" ? recognition.outcome : null;
    const result = await saveCaptureAction({
      wineId: sameWine ? sameWine.id : null,
      wine: sameWine ? undefined : identityToPayload(identity, confirmedAt),
      tasting: tastingToPayload(tasting),
      imageIds: imageId ? [imageId] : [],
      recognition: outcome
        ? { provider: outcome.provider, imageId, extractedText: outcome.extractedText, candidate: outcome.candidate, confidence: outcome.overallConfidence }
        : null,
    }).catch(() => ({ ok: false as const, error: "We couldn't reach the server. Your entry is saved on this device — try again when you're back online." }));
    if (result.ok) {
      clearDraft(DRAFT_KEY);
      router.push(`/wines/${result.data.wineId}?saved=${result.data.tastingId}#tasting-${result.data.tastingId}`);
      return;
    }
    setSaving(false);
    setSaveError({ message: result.error, details: "details" in result ? result.details : undefined });
  }

  function startOver() {
    clearDraft(DRAFT_KEY);
    setStep("photo");
    setImageId(null);
    setPreview(null);
    setIdentity(emptyIdentity());
    setSuggestions([]);
    setTasting(emptyTasting(today, defaultCurrency));
    setRecognition({ status: "idle" });
    setMatches([]);
    setMatchChoice("new");
    setConfirmed(false);
    setRestoredAt(null);
    setSaveError(null);
    userChoseMatch.current = false;
  }

  const wineTypeForTasting = sameWine?.wineType ?? identity.wineType;
  const photoSrc = useMemo(() => preview ?? (imageId ? `/api/images/${imageId}?size=display` : null), [preview, imageId]);

  return (
    <div>
      <Steps step={step} />
      {restoredAt && (
        <div className={s.restored}>
          <Notice tone="info" title="Unsaved entry restored">
            We kept what you entered {new Date(restoredAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.{" "}
            <button type="button" onClick={startOver} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", textDecoration: "underline" }}>
              Start over
            </button>
          </Notice>
        </div>
      )}

      {step === "photo" && (
        <section className={s.stack} aria-labelledby="step-title">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className={s.sectionTitle} style={{ fontSize: "var(--text-xl)" }}>
            Photograph the label
          </h2>
          <div className={s.photoStage}>
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoSrc} alt="Your label photo" />
            ) : (
              <div className={s.photoEmpty}>
                <div className={s.frameGuide} aria-hidden="true" />
                <span>Fill the frame with the front label, straight on, in even light.</span>
              </div>
            )}
            {(photoState.status === "preparing" || photoState.status === "uploading") && (
              <div className={s.photoOverlay} role="status">
                <span className={s.spinner} aria-hidden="true" />
                {photoState.status === "preparing" ? "Preparing photo…" : "Uploading securely…"}
              </div>
            )}
          </div>
          {photoState.status === "error" && (
            <Notice tone="error" title="That photo didn't work">
              {photoState.error} You can try again or continue without a photo.
            </Notice>
          )}
          <input ref={cameraRef} className={s.fileInput} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0], "camera")} />
          <input ref={libraryRef} className={s.fileInput} type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0], "user_upload")} />
          <div className={s.photoActions}>
            <Button variant="primary" icon="capture" onClick={() => cameraRef.current?.click()} disabled={photoState.status === "preparing" || photoState.status === "uploading"}>
              Take photo
            </Button>
            <Button icon="image" onClick={() => libraryRef.current?.click()} disabled={photoState.status === "preparing" || photoState.status === "uploading"}>
              Choose photo
            </Button>
          </div>
          {imageId && (
            <Button variant="secondary" block onClick={() => go("identify")}>
              Keep this photo and continue
            </Button>
          )}
          <Button variant="ghost" block onClick={() => go("identify")}>
            Skip the photo — enter details by hand
          </Button>
          <ul className={s.tips}>
            <li>Avoid glare: tilt the bottle slightly away from overhead lights.</li>
            <li>{recognitionAvailable ? `${providerName} will suggest details from the label; you confirm every one.` : "Label reading isn't set up, so you'll enter the details yourself."}</li>
          </ul>
        </section>
      )}

      {step === "identify" && (
        <section className={s.stack} aria-labelledby="step-title">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className={s.sectionTitle} style={{ fontSize: "var(--text-xl)" }}>
            Confirm the wine
          </h2>

          {imageId && (
            <div style={{ display: "grid", gridTemplateColumns: "4.5rem 1fr", gap: "var(--space-4)", alignItems: "start" }}>
              <WineThumb imageId={imageId} wineType={identity.wineType} alt="Your label photo" />
              <div className={s.stackTight}>
                {recognition.status === "running" && (
                  <p role="status" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                    <span className={s.spinner} aria-hidden="true" /> Reading the label… you can start typing.
                  </p>
                )}
                {recognition.status === "done" && (
                  <div className={s.reading}>
                    <div className={s.readingHead}>
                      <span className="eyebrow">Read from label</span>
                      <ConfidenceMeter value={recognition.outcome.overallConfidence} />
                    </div>
                    {recognition.outcome.issues.length > 0 && (
                      <Notice tone="warning" title="Check carefully">
                        <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
                          {recognition.outcome.issues.map((i) => (
                            <li key={i}>{ISSUE_LABEL[i]}</li>
                          ))}
                        </ul>
                      </Notice>
                    )}
                    {recognition.outcome.extractedText && (
                      <details>
                        <summary className="muted" style={{ fontSize: "var(--text-xs)", cursor: "pointer" }}>
                          Text found on the label
                        </summary>
                        <pre className={s.extracted}>{recognition.outcome.extractedText}</pre>
                      </details>
                    )}
                    <div>
                      <Button size="small" variant="ghost" onClick={() => runRecognition(imageId)}>
                        Read again
                      </Button>
                    </div>
                  </div>
                )}
                {recognition.status === "unavailable" && <Notice tone="info">{recognition.reason}</Notice>}
                {recognition.status === "failed" && (
                  <Notice tone="warning" title="Couldn't read the label">
                    {recognition.reason}{" "}
                    {recognition.retryable && (
                      <Button size="small" onClick={() => runRecognition(imageId)}>
                        Try again
                      </Button>
                    )}
                  </Notice>
                )}
                {recognition.status === "idle" && recognitionAvailable && (
                  <Button size="small" icon="sparkle" onClick={() => runRecognition(imageId)}>
                    Read the label
                  </Button>
                )}
              </div>
            </div>
          )}

          {visibleMatches.length > 0 && (
            <div className={s.matches} role="radiogroup" aria-labelledby="matches-title">
              <p className="eyebrow" id="matches-title">
                Already in your journal
              </p>
              {matches
                .filter((m) => m.match === "same_wine")
                .map((m) => (
                  <label key={m.id} className={s.matchOption}>
                    <input
                      type="radio"
                      name="match"
                      checked={matchChoice === m.id}
                      onChange={() => {
                        userChoseMatch.current = true;
                        setMatchChoice(m.id);
                      }}
                    />
                    <WineThumb imageId={m.thumbImageId} wineType={m.wineType} alt="" />
                    <span>
                      <span className={s.matchTitle}>
                        Add to {[m.producer, m.name].filter(Boolean).join(" ")} {m.vintage ?? (m.isNonVintage ? "NV" : "")}
                      </span>
                      <br />
                      <span className={s.matchMeta}>{plural(m.tastings, "tasting")} so far · keeps one record for this bottle</span>
                    </span>
                  </label>
                ))}
              <label className={`${s.matchOption} ${s.matchNew}`}>
                <input
                  type="radio"
                  name="match"
                  checked={matchChoice === "new"}
                  onChange={() => {
                    userChoseMatch.current = true;
                    setMatchChoice("new");
                  }}
                />
                <span>
                  <span className={s.matchTitle}>Create a new wine record</span>
                  <br />
                  <span className={s.matchMeta}>Use this for a different bottling or vintage.</span>
                </span>
              </label>
              {visibleMatches.some((m) => m.match === "other_vintage") && (
                <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  Other vintages you&rsquo;ve recorded:{" "}
                  {matches
                    .filter((m) => m.match === "other_vintage")
                    .map((m) => m.vintage ?? (m.isNonVintage ? "NV" : "unknown"))
                    .join(", ")}
                </p>
              )}
            </div>
          )}

          {sameWine ? (
            <Notice tone="success" title="Adding a new tasting to an existing wine">
              Earlier tastings stay exactly as they are. To correct the wine&rsquo;s details, edit it from its page.
            </Notice>
          ) : (
            <IdentityForm
              value={identity}
              onChange={(next) => {
                setIdentity(next);
                if (Object.keys(identityErrors).length) setIdentityErrors(validateIdentity(next));
              }}
              suggestions={suggestions}
              onAcceptSuggestion={(sg) => {
                setIdentity((d) => sg.apply(d));
                setSuggestions((list) => list.filter((x) => x.field !== sg.field));
                setConfirmed(false);
              }}
              errors={identityErrors}
            >
              {providerFieldCount > 0 && (
                <label className={s.checkRow} style={{ padding: "var(--space-3)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", background: "var(--surface)" }}>
                  <input id="confirm-identity" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>
                    I&rsquo;ve checked the {plural(providerFieldCount, "detail")} read from the label{" "}
                    {!confirmed && <span style={{ color: "var(--error)" }}>(required)</span>}
                  </span>
                </label>
              )}
            </IdentityForm>
          )}

          <div className={s.actionBar}>
            <Button variant="ghost" icon="back" onClick={() => go("photo")}>
              Photo
            </Button>
            <Button variant="primary" onClick={continueFromIdentity}>
              Continue to tasting
            </Button>
          </div>
        </section>
      )}

      {step === "taste" && (
        <section aria-labelledby="step-title">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className={s.sectionTitle} style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-5)" }}>
            Record the tasting
          </h2>
          <TastingForm value={tasting} onChange={setTasting} wineType={wineTypeForTasting} today={today} errors={tastingErrors} />
          <div className={s.actionBar}>
            <Button variant="ghost" icon="back" onClick={() => go("identify")}>
              Identity
            </Button>
            <Button variant="primary" onClick={continueFromTasting}>
              Review
            </Button>
          </div>
        </section>
      )}

      {step === "review" && (
        <section className={s.stack} aria-labelledby="step-title">
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className={s.sectionTitle} style={{ fontSize: "var(--text-xl)" }}>
            Review and save
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "5rem 1fr", gap: "var(--space-4)", alignItems: "start" }}>
            <WineThumb imageId={imageId} wineType={wineTypeForTasting} alt="" />
            <div>
              {sameWine ? (
                <>
                  <p className="eyebrow">New tasting of</p>
                  <p style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)" }}>
                    {[sameWine.producer, sameWine.name].filter(Boolean).join(" ")} {sameWine.vintage ?? (sameWine.isNonVintage ? "NV" : "")}
                  </p>
                </>
              ) : (
                <>
                  <p className="eyebrow">New wine</p>
                  {identity.producer && <p className="muted">{identity.producer}</p>}
                  <p style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)" }}>
                    {identity.name} {identity.isNonVintage ? "NV" : identity.vintage}
                  </p>
                  <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                    {[wineTypeLabel(identity.wineType), identity.appellation, identity.subregion, identity.region, countryName(identity.country)].filter(Boolean).join(" · ")}
                  </p>
                </>
              )}
            </div>
          </div>
          <dl className={s.summaryList}>
            <dt>Tasted</dt>
            <dd>{tasting.tastedOn ? formatDate(tasting.tastedOn, undefined, "long") : "—"}</dd>
            <dt>Your score</dt>
            <dd>{tasting.score === null ? "Not rated" : `${formatScore(tasting.score)} / 10`}</dd>
            <dt>Structure</dt>
            <dd>{Object.keys(tasting.scales).length ? `${Object.keys(tasting.scales).length} recorded` : "Not assessed"}</dd>
            <dt>Descriptors</dt>
            <dd>{[...tasting.aromas, ...tasting.flavors].join(", ") || "None"}</dd>
            {tasting.price && (
              <>
                <dt>Price</dt>
                <dd>
                  {tasting.price} {tasting.currency}
                </dd>
              </>
            )}
            <dt>Photo</dt>
            <dd>{imageId ? "Attached" : "None"}</dd>
          </dl>
          {saveError && (
            <Notice tone="error" title="Not saved yet">
              {saveError.message}
              {saveError.details && saveError.details.length > 1 && (
                <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "1.1em" }}>
                  {saveError.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </Notice>
          )}
          <div className={s.actionBar}>
            <Button variant="ghost" icon="back" onClick={() => go("taste")} disabled={saving}>
              Tasting
            </Button>
            <Button variant="primary" onClick={save} disabled={saving} aria-busy={saving}>
              {saving ? (
                "Saving…"
              ) : (
                <>
                  <Icon name="check" size={18} /> Save to journal
                </>
              )}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
