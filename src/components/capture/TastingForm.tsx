"use client";

import { useState } from "react";
import { CURRENCIES, PRICE_BASES } from "@/lib/domain/currency";
import { ADVANCED_DIMENSIONS, CATEGORICAL_DIMENSIONS, DESCRIPTOR_FAMILIES, QUICK_DIMENSIONS, dimensionByKey, type CategoricalKey } from "@/lib/domain/sensory";
import { tanninTypicallyApplies } from "@/lib/domain/wine";
import { ScaleInput, type ScaleValue } from "@/components/ui/ScaleInput";
import { ScoreInput } from "@/components/ui/ScoreInput";
import { Icon } from "@/components/ui/Icon";
import { Button, Disclosure, Field, Input, Segmented, Select, Textarea, uiStyles } from "@/components/ui/primitives";
import type { TastingDraft } from "./drafts";
import s from "./capture.module.css";

type Errors = Partial<Record<"tastedOn" | "price" | "currency" | "servingTempC" | "decantMinutes", string>>;

export function validateTasting(d: TastingDraft, today: string): Errors {
  const e: Errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tastedOn)) e.tastedOn = "Choose the date of the tasting.";
  else if (d.tastedOn > today) e.tastedOn = "The tasting date can't be in the future.";
  if (d.price.trim()) {
    const n = Number(d.price.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) e.price = "Enter the price as a number.";
    if (!/^[A-Z]{3}$/.test(d.currency)) e.currency = "Choose a currency.";
  }
  if (d.servingTempC.trim() && !(Number(d.servingTempC) >= -5 && Number(d.servingTempC) <= 40)) e.servingTempC = "Use a temperature between −5 and 40 °C.";
  if (d.decantMinutes.trim() && !(Number(d.decantMinutes) >= 0 && Number(d.decantMinutes) <= 2880)) e.decantMinutes = "Use minutes between 0 and 2880.";
  return e;
}

function DescriptorPicker({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const [own, setOwn] = useState("");
  const toggle = (term: string) => {
    const exists = value.some((v) => v.toLowerCase() === term.toLowerCase());
    onChange(exists ? value.filter((v) => v.toLowerCase() !== term.toLowerCase()) : [...value, term]);
  };
  const addOwn = () => {
    const t = own.trim().replace(/\s+/g, " ");
    if (t && t.length <= 60 && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setOwn("");
  };
  return (
    <div className={s.stackTight}>
      <div className={s.selected} aria-live="polite">
        {value.length === 0 ? (
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Nothing noted yet.
          </span>
        ) : (
          value.map((v) => (
            <button key={v} type="button" className={uiStyles.chip} aria-pressed="true" onClick={() => toggle(v)} aria-label={`Remove ${v}`}>
              {v} <Icon name="close" size={14} />
            </button>
          ))
        )}
      </div>
      <div className={s.addOwn}>
        <Input
          aria-label={`Add your own ${label.toLowerCase()} descriptor`}
          placeholder="Add your own word"
          value={own}
          maxLength={60}
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOwn();
            }
          }}
        />
        <Button onClick={addOwn} disabled={!own.trim()}>
          Add
        </Button>
      </div>
      <details>
        <summary className={uiStyles.label} style={{ cursor: "pointer", minHeight: "var(--touch)", display: "flex", alignItems: "center" }}>
          Browse the descriptor lexicon
        </summary>
        <div className={s.descriptorFamilies} style={{ paddingTop: "var(--space-2)" }}>
          {DESCRIPTOR_FAMILIES.map((f) => (
            <div key={f.family} className={s.family}>
              <span className={s.familyName}>
                {f.family} <span style={{ fontWeight: 400 }}>· {f.category}</span>
              </span>
              <div className={s.chips}>
                {f.terms.map((t) => (
                  <button key={t} type="button" className={uiStyles.chip} aria-pressed={value.some((v) => v.toLowerCase() === t.toLowerCase())} onClick={() => toggle(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export function TastingForm({
  value,
  onChange,
  wineType,
  today,
  errors = {},
}: {
  value: TastingDraft;
  onChange: (next: TastingDraft) => void;
  wineType: string;
  today: string;
  errors?: Errors;
}) {
  const [palateSide, setPalateSide] = useState<"aromas" | "flavors">("aromas");
  const set = <K extends keyof TastingDraft>(k: K, v: TastingDraft[K]) => onChange({ ...value, [k]: v });
  const setScale = (key: string, v: ScaleValue) => {
    const scales = { ...value.scales };
    if (v === null) delete scales[key];
    else scales[key] = v;
    onChange({ ...value, scales });
  };
  const setCategorical = (key: CategoricalKey, v: string) => {
    const categorical = { ...value.categorical };
    if (!v) delete categorical[key];
    else categorical[key] = v;
    onChange({ ...value, categorical });
  };
  const advancedCount =
    ADVANCED_DIMENSIONS.filter((d) => value.scales[d.key]).length +
    Object.values(value.categorical).filter(Boolean).length +
    [value.servingTempC, value.decantMinutes, value.bottleProvenance, value.storageNotes].filter((v) => v.trim()).length +
    (value.blindStatus !== "not_blind" ? 1 : 0);

  return (
    <div className={s.stack}>
      <Field id="tasted-on" label="Date tasted" error={errors.tastedOn}>
        <Input id="tasted-on" type="date" value={value.tastedOn} max={today} onChange={(e) => set("tastedOn", e.target.value)} invalid={Boolean(errors.tastedOn)} style={{ maxWidth: "14rem" }} />
      </Field>

      <ScoreInput value={value.score} onChange={(v) => set("score", v)} />

      <section className={s.section} aria-labelledby="structure-title">
        <h3 className={s.sectionTitle} id="structure-title">
          Structure
        </h3>
        <p className={s.sectionHint}>Tap what you noticed. Anything left untouched is recorded as not assessed, never as zero.</p>
        {QUICK_DIMENSIONS.map((d) => (
          <ScaleInput
            key={d.key}
            dimension={d}
            value={value.scales[d.key] ?? null}
            onChange={(v) => setScale(d.key, v)}
            showNotApplicable={d.key === "tannin" && !tanninTypicallyApplies(wineType)}
          />
        ))}
      </section>

      <section className={s.section} aria-labelledby="palate-title">
        <h3 className={s.sectionTitle} id="palate-title">
          Aromas &amp; flavours
        </h3>
        <Segmented
          name="palate-side"
          legend="Recording"
          hideLegend
          value={palateSide}
          onChange={setPalateSide}
          options={[
            { value: "aromas", label: `On the nose${value.aromas.length ? ` · ${value.aromas.length}` : ""}` },
            { value: "flavors", label: `On the palate${value.flavors.length ? ` · ${value.flavors.length}` : ""}` },
          ]}
        />
        {palateSide === "aromas" ? (
          <DescriptorPicker label="Aroma" value={value.aromas} onChange={(v) => set("aromas", v)} />
        ) : (
          <DescriptorPicker label="Flavour" value={value.flavors} onChange={(v) => set("flavors", v)} />
        )}
      </section>

      <section className={s.section} aria-labelledby="words-title">
        <h3 className={s.sectionTitle} id="words-title">
          In your words
        </h3>
        <Field id="impression" label="Overall impression" optional hint="One line you'd want to remember.">
          <Input id="impression" value={value.impression} maxLength={300} onChange={(e) => set("impression", e.target.value)} placeholder="e.g. Taut and saline, opened beautifully with air" />
        </Field>
        <Field id="notes" label="Notes" optional>
          <Textarea id="notes" value={value.notes} maxLength={10000} rows={4} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </section>

      <section className={s.section} aria-labelledby="context-title">
        <h3 className={s.sectionTitle} id="context-title">
          Purchase &amp; occasion
        </h3>
        <div className={s.row3}>
          <Field id="price" label="Price paid" optional error={errors.price}>
            <Input id="price" inputMode="decimal" value={value.price} onChange={(e) => set("price", e.target.value)} placeholder="–" invalid={Boolean(errors.price)} />
          </Field>
          <Field id="currency" label="Currency" error={errors.currency}>
            <Select id="currency" value={value.currency} onChange={(e) => set("currency", e.target.value)} invalid={Boolean(errors.currency)}>
              {!CURRENCIES.includes(value.currency as (typeof CURRENCIES)[number]) && value.currency && <option value={value.currency}>{value.currency}</option>}
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="price-basis" label="Price for">
            <Select id="price-basis" value={value.priceBasis} onChange={(e) => set("priceBasis", e.target.value)} disabled={!value.price.trim()}>
              {PRICE_BASES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Segmented
          name="buy-again"
          legend="Would you buy it again?"
          value={value.wouldBuyAgain === null ? "unanswered" : value.wouldBuyAgain ? "yes" : "no"}
          onChange={(v) => set("wouldBuyAgain", v === "unanswered" ? null : v === "yes")}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unanswered", label: "Not sure" },
          ]}
        />
        <div className={s.row2}>
          <Field id="venue" label="Where" optional>
            <Input id="venue" value={value.venue} maxLength={160} onChange={(e) => set("venue", e.target.value)} placeholder="Home, a restaurant…" />
          </Field>
          <Field id="occasion" label="Occasion" optional>
            <Input id="occasion" value={value.occasion} maxLength={160} onChange={(e) => set("occasion", e.target.value)} />
          </Field>
        </div>
        <Field id="food" label="Food pairing" optional>
          <Input id="food" value={value.foodPairing} maxLength={200} onChange={(e) => set("foodPairing", e.target.value)} />
        </Field>
        <Field id="tags" label="Tags" optional hint="Separate with commas.">
          <Input id="tags" value={value.tags} onChange={(e) => set("tags", e.target.value)} placeholder="e.g. anniversary, cellar" autoCapitalize="none" />
        </Field>
      </section>

      <div>
        <Disclosure title="Advanced observations" meta={advancedCount ? `${advancedCount} recorded` : "Optional"}>
          <div className={s.stackTight}>
            <p className="eyebrow">Appearance</p>
            <div className={s.row2}>
              {(["clarity", "colour"] as const).map((k) => (
                <Field key={k} id={`cat-${k}`} label={CATEGORICAL_DIMENSIONS[k].label} optional>
                  <Select id={`cat-${k}`} value={value.categorical[k] ?? ""} onChange={(e) => setCategorical(k, e.target.value)}>
                    <option value="">Not assessed</option>
                    {CATEGORICAL_DIMENSIONS[k].options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <ScaleInput dimension={dimensionByKey("colour_intensity")!} value={value.scales.colour_intensity ?? null} onChange={(v) => setScale("colour_intensity", v)} />
          </div>
          <div className={s.stackTight}>
            <p className="eyebrow">Nose &amp; palate</p>
            {ADVANCED_DIMENSIONS.filter((d) => d.key !== "colour_intensity").map((d) => (
              <ScaleInput key={d.key} dimension={d} value={value.scales[d.key] ?? null} onChange={(v) => setScale(d.key, v)} showNotApplicable={d.key === "mousse" && wineType !== "sparkling"} />
            ))}
            <div className={s.row2}>
              {(["development", "texture"] as const).map((k) => (
                <Field key={k} id={`cat-${k}`} label={CATEGORICAL_DIMENSIONS[k].label} optional>
                  <Select id={`cat-${k}`} value={value.categorical[k] ?? ""} onChange={(e) => setCategorical(k, e.target.value)}>
                    <option value="">Not assessed</option>
                    {CATEGORICAL_DIMENSIONS[k].options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </div>
          <div className={s.stackTight}>
            <p className="eyebrow">Service</p>
            <div className={s.row2}>
              <Field id="temp" label="Serving temp. °C" optional error={errors.servingTempC}>
                <Input id="temp" inputMode="decimal" value={value.servingTempC} onChange={(e) => set("servingTempC", e.target.value)} />
              </Field>
              <Field id="decant" label="Decanted, minutes" optional error={errors.decantMinutes}>
                <Input id="decant" inputMode="numeric" value={value.decantMinutes} onChange={(e) => set("decantMinutes", e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
          </div>
          <div className={s.stackTight}>
            <p className="eyebrow">Blind tasting</p>
            <Segmented
              name="blind"
              legend="Tasted blind?"
              value={value.blindStatus}
              onChange={(v) => set("blindStatus", v)}
              options={[
                { value: "not_blind", label: "No" },
                { value: "blind_unrevealed", label: "Blind" },
                { value: "blind_revealed", label: "Revealed" },
              ]}
            />
            {value.blindStatus !== "not_blind" && (
              <Field id="blind-guess" label="Your guess before the reveal" optional>
                <Input id="blind-guess" value={value.blindGuess} maxLength={300} onChange={(e) => set("blindGuess", e.target.value)} />
              </Field>
            )}
          </div>
          <div className={s.stackTight}>
            <p className="eyebrow">Provenance</p>
            <Field id="bottle-provenance" label="Where the bottle came from" optional>
              <Input id="bottle-provenance" value={value.bottleProvenance} maxLength={300} onChange={(e) => set("bottleProvenance", e.target.value)} />
            </Field>
            <Field id="storage" label="Storage notes" optional>
              <Input id="storage" value={value.storageNotes} maxLength={300} onChange={(e) => set("storageNotes", e.target.value)} />
            </Field>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
