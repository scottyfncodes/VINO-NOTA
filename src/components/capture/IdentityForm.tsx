"use client";

import type { ReactNode } from "react";
import { COUNTRIES } from "@/lib/domain/countries";
import { WINE_TYPES } from "@/lib/domain/wine";
import { Badge, Button, Field, Input, Select, uiStyles } from "@/components/ui/primitives";
import { isCatalogSource, type IdentityDraft, type IdentityField, type Suggestion } from "./drafts";
import s from "./capture.module.css";

const COMMON_GRAPES = [
  "Albariño", "Barbera", "Cabernet Franc", "Cabernet Sauvignon", "Carménère", "Chardonnay", "Chenin Blanc", "Cinsault", "Corvina",
  "Gamay", "Garganega", "Gewürztraminer", "Glera", "Grenache", "Grüner Veltliner", "Malbec", "Marsanne", "Merlot", "Mourvèdre",
  "Muscat", "Nebbiolo", "Nero d'Avola", "Petit Verdot", "Pinot Blanc", "Pinot Gris", "Pinot Meunier", "Pinot Noir", "Primitivo",
  "Riesling", "Roussanne", "Sangiovese", "Sauvignon Blanc", "Sémillon", "Syrah", "Tempranillo", "Touriga Nacional", "Verdejo",
  "Vermentino", "Viognier", "Zinfandel",
];

function ProviderBadge({ draft, field }: { draft: IdentityDraft; field: IdentityField }) {
  const mark = draft.fromProvider[field];
  if (!mark) return null;
  if (isCatalogSource(mark.provider)) {
    return (
      <Badge tone="neutral" title="Not on the label: completed from the Vino Nota reference catalog. Check it before saving.">
        From catalog · {Math.round(mark.confidence * 100)}%
      </Badge>
    );
  }
  return (
    <Badge tone="accent" title="Read from your label photo. Edit it if it's wrong.">
      From label · {Math.round(mark.confidence * 100)}%
    </Badge>
  );
}

function Label({ text, draft, field }: { text: string; draft: IdentityDraft; field: IdentityField }) {
  return (
    <span className={s.labelRow}>
      {text} <ProviderBadge draft={draft} field={field} />
    </span>
  );
}

export function IdentityForm({
  value,
  onChange,
  suggestions = [],
  onAcceptSuggestion,
  errors = {},
  children,
}: {
  value: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
  suggestions?: Suggestion[];
  onAcceptSuggestion?: (s: Suggestion) => void;
  errors?: Partial<Record<IdentityField, string>>;
  children?: ReactNode;
}) {
  /** Any edit makes the field user-owned. */
  const set = <K extends keyof IdentityDraft>(field: K, v: IdentityDraft[K], owner: IdentityField = field as IdentityField) => {
    const fromProvider = { ...value.fromProvider };
    delete fromProvider[owner];
    onChange({ ...value, [field]: v, fromProvider });
  };

  return (
    <div className={s.stack}>
      {suggestions.length > 0 && (
        <div className={s.suggestions} aria-label="Uncertain readings">
          <p className="eyebrow">Uncertain readings: use only if they match the label</p>
          {suggestions.map((sg) => (
            <div key={sg.field} className={s.suggestion}>
              <span className={s.suggestionText}>
                {sg.field === "wineType" ? "Type" : sg.field[0].toUpperCase() + sg.field.slice(1)}:{" "}
                <span className={s.suggestionValue}>{sg.display}</span> <span className="muted">({Math.round(sg.confidence * 100)}%)</span>
              </span>
              <Button size="small" onClick={() => onAcceptSuggestion?.(sg)}>
                Use
              </Button>
            </div>
          ))}
        </div>
      )}

      <Field id="producer" label={<Label text="Producer" draft={value} field="producer" />} optional>
        <Input id="producer" value={value.producer} onChange={(e) => set("producer", e.target.value)} autoComplete="off" autoCapitalize="words" placeholder="e.g. Domaine Huet" />
      </Field>

      <Field id="wine-name" label={<Label text="Wine name" draft={value} field="name" />} error={errors.name} hint="The cuvée, or the appellation if the label has no other name.">
        <Input id="wine-name" value={value.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" autoCapitalize="words" required invalid={Boolean(errors.name)} placeholder="e.g. Le Haut-Lieu Sec" />
      </Field>

      <div className={s.row2}>
        <Field id="vintage" label={<Label text="Vintage" draft={value} field="vintage" />} error={errors.vintage}>
          <Input
            id="vintage"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={value.vintage}
            disabled={value.isNonVintage}
            placeholder={value.isNonVintage ? "NV" : "Unknown"}
            onChange={(e) => set("vintage", e.target.value.replace(/\D/g, ""))}
            invalid={Boolean(errors.vintage)}
          />
        </Field>
        <label className={s.checkRow} style={{ alignSelf: "end" }}>
          <input
            type="checkbox"
            checked={value.isNonVintage}
            onChange={(e) => {
              const fromProvider = { ...value.fromProvider };
              delete fromProvider.vintage;
              onChange({ ...value, isNonVintage: e.target.checked, vintage: e.target.checked ? "" : value.vintage, fromProvider });
            }}
          />
          Non-vintage (NV)
        </label>
      </div>

      <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend className={uiStyles.label} style={{ marginBottom: "var(--space-2)", padding: 0 }}>
          <Label text="Type" draft={value} field="wineType" />
        </legend>
        <div className={s.typeGrid}>
          {WINE_TYPES.map((t) => (
            <label key={t.value} className={uiStyles.chip}>
              <input type="radio" name="wineType" value={t.value} checked={value.wineType === t.value} onChange={() => set("wineType", t.value)} />
              {t.label}
            </label>
          ))}
        </div>
        {errors.wineType && (
          <p className={uiStyles.error} role="alert" style={{ marginTop: "var(--space-1)" }}>
            {errors.wineType}
          </p>
        )}
      </fieldset>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Origin</h3>
        <Field id="country" label={<Label text="Country" draft={value} field="country" />} error={errors.country} optional>
          <Select id="country" value={value.country} onChange={(e) => set("country", e.target.value)} invalid={Boolean(errors.country)}>
            <option value="">Unknown</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className={s.row2}>
          <Field id="region" label={<Label text="Region" draft={value} field="region" />} error={errors.region} optional>
            <Input id="region" value={value.region} onChange={(e) => set("region", e.target.value)} placeholder="e.g. Loire" autoCapitalize="words" />
          </Field>
          <Field id="subregion" label={<Label text="Sub-region" draft={value} field="subregion" />} optional>
            <Input id="subregion" value={value.subregion} onChange={(e) => set("subregion", e.target.value)} placeholder="e.g. Touraine" disabled={!value.region} autoCapitalize="words" />
          </Field>
        </div>
        <Field id="appellation" label={<Label text="Appellation" draft={value} field="appellation" />} optional hint="As printed, e.g. Vouvray AOC, Barolo DOCG.">
          <Input id="appellation" value={value.appellation} onChange={(e) => set("appellation", e.target.value)} autoCapitalize="words" />
        </Field>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>
          <span className={s.labelRow}>
            Composition <ProviderBadge draft={value} field="grapes" />
          </span>
        </h3>
        <datalist id="grape-list">
          {COMMON_GRAPES.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        {value.grapes.map((g, i) => (
          <div key={i} className={s.grapeRow}>
            <Field id={`grape-${i}`} label={i === 0 ? "Grape" : <span className="visually-hidden">Grape {i + 1}</span>}>
              <Input
                id={`grape-${i}`}
                list="grape-list"
                value={g.name}
                autoCapitalize="words"
                onChange={(e) => set("grapes", value.grapes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)), "grapes")}
              />
            </Field>
            <Field id={`grape-pct-${i}`} label={i === 0 ? "Share %" : <span className="visually-hidden">Share of grape {i + 1}</span>}>
              <Input
                id={`grape-pct-${i}`}
                inputMode="decimal"
                value={g.percentage}
                placeholder="–"
                onChange={(e) => set("grapes", value.grapes.map((x, j) => (j === i ? { ...x, percentage: e.target.value } : x)), "grapes")}
              />
            </Field>
            <Button
              variant="ghost"
              iconOnly
              icon="close"
              aria-label={`Remove ${g.name || "grape"}`}
              onClick={() => set("grapes", value.grapes.filter((_, j) => j !== i), "grapes")}
            />
          </div>
        ))}
        {errors.grapes && <p className={uiStyles.error}>{errors.grapes}</p>}
        <div>
          <Button size="small" icon="plus" onClick={() => set("grapes", [...value.grapes, { name: "", percentage: "" }], "grapes")}>
            Add grape
          </Button>
        </div>
        <Field id="alcohol" label={<Label text="Alcohol % vol" draft={value} field="alcoholPct" />} optional error={errors.alcoholPct}>
          <Input id="alcohol" inputMode="decimal" value={value.alcoholPct} onChange={(e) => set("alcoholPct", e.target.value)} placeholder="e.g. 13.5" style={{ maxWidth: "8rem" }} />
        </Field>
      </div>
      {children}
    </div>
  );
}

/** Lightweight client-side checks mirroring server validation for immediate feedback. */
export function validateIdentity(d: IdentityDraft): Partial<Record<IdentityField, string>> {
  const errors: Partial<Record<IdentityField, string>> = {};
  if (!d.name.trim()) errors.name = "Add the wine's name. Use the appellation if there's no other name.";
  if (!d.wineType) errors.wineType = "Choose the wine's type.";
  if (d.vintage && !/^\d{4}$/.test(d.vintage)) errors.vintage = "Use a four-digit year.";
  else if (d.vintage && (Number(d.vintage) < 1800 || Number(d.vintage) > 2100)) errors.vintage = "That year looks out of range.";
  if ((d.region || d.subregion) && !d.country) errors.country = "Choose a country for this region.";
  if (d.alcoholPct && !(Number(d.alcoholPct.replace(",", ".")) >= 0 && Number(d.alcoholPct.replace(",", ".")) <= 25)) errors.alcoholPct = "Alcohol must be between 0 and 25%.";
  const total = d.grapes.reduce((sum, g) => sum + (Number(g.percentage) || 0), 0);
  if (total > 100.5) errors.grapes = "Grape shares add up to more than 100%.";
  if (d.grapes.some((g) => g.percentage && !(Number(g.percentage) > 0 && Number(g.percentage) <= 100))) errors.grapes = "Each share must be between 0 and 100%.";
  return errors;
}
