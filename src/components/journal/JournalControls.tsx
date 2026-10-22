"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { COUNTRIES, countryName } from "@/lib/domain/countries";
import { WINE_TYPES, wineTypeLabel } from "@/lib/domain/wine";
import { Icon } from "@/components/ui/Icon";
import { Button, Field, Input, Select, uiStyles } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import s from "./journal.module.css";

const SORTS = [
  { value: "date_desc", label: "Newest tasting" },
  { value: "date_asc", label: "Oldest tasting" },
  { value: "score_desc", label: "Highest rated" },
  { value: "score_asc", label: "Lowest rated" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "price_asc", label: "Price, low to high" },
];

const FILTER_KEYS = ["type", "country", "region", "grape", "min", "max", "from", "to"] as const;

export function JournalControls({ facets }: { facets: { countries: string[]; regions: string[]; grapes: string[] } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const push = (next: URLSearchParams) => {
    const str = next.toString();
    startTransition(() => router.replace(str ? `${pathname}?${str}` : pathname, { scroll: false }));
  };

  // Debounced search.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const h = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      push(next);
    }, 300);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };

  const active = FILTER_KEYS.filter((k) => params.get(k));
  const view = params.get("view") === "grid" ? "grid" : "list";
  const viewHref = (v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v === "list") next.delete("view");
    else next.set("view", v);
    const str = next.toString();
    return str ? `${pathname}?${str}` : pathname;
  };

  const describe = (k: (typeof FILTER_KEYS)[number], v: string) => {
    switch (k) {
      case "type":
        return wineTypeLabel(v);
      case "country":
        return countryName(v) ?? v;
      case "min":
        return `Score ≥ ${v}`;
      case "max":
        return `Score ≤ ${v}`;
      case "from":
        return `From ${v}`;
      case "to":
        return `Until ${v}`;
      default:
        return v;
    }
  };

  function openSheet() {
    setDraft(Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])));
    setOpen(true);
  }

  function apply() {
    const next = new URLSearchParams(params.toString());
    for (const k of FILTER_KEYS) {
      if (draft[k]) next.set(k, draft[k]);
      else next.delete(k);
    }
    push(next);
    setOpen(false);
  }

  const d = (k: string) => draft[k] ?? "";
  const setD = (k: string, v: string) => setDraft((x) => ({ ...x, [k]: v }));

  return (
    <div className={s.controls} aria-busy={pending}>
      <div className={s.searchRow}>
        <div className={s.search} role="search">
          <Icon name="search" size={18} />
          <label htmlFor="journal-search" className="visually-hidden">
            Search your journal
          </label>
          <Input id="journal-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Wine, producer, grape, region, notes…" autoComplete="off" enterKeyHint="search" />
        </div>
        <Button icon="filter" onClick={openSheet} aria-label={`Filters${active.length ? `, ${active.length} active` : ""}`}>
          <span className={s.filterLabel}>Filter</span>
          {active.length > 0 && <span className={s.filterBadge}>{active.length}</span>}
        </Button>
      </div>
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          <label htmlFor="journal-sort" className={s.sortLabel}>
            Sort by
          </label>
          <Select id="journal-sort" className={s.sortSelect} value={params.get("sort") ?? "date_desc"} onChange={(e) => setParam("sort", e.target.value === "date_desc" ? null : e.target.value)}>
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className={s.viewToggle} role="group" aria-label="Layout">
          <Link href={viewHref("list")} aria-current={view === "list"} aria-label="List view" replace scroll={false}>
            <Icon name="list" size={18} />
          </Link>
          <Link href={viewHref("grid")} aria-current={view === "grid"} aria-label="Grid view" replace scroll={false}>
            <Icon name="grid" size={18} />
          </Link>
        </div>
      </div>
      {active.length > 0 && (
        <div className={s.activeFilters}>
          {active.map((k) => (
            <button key={k} type="button" className={uiStyles.chip} aria-pressed="true" onClick={() => setParam(k, null)} aria-label={`Remove filter ${describe(k, params.get(k)!)}`}>
              {describe(k, params.get(k)!)} <Icon name="close" size={14} />
            </button>
          ))}
          <button
            type="button"
            className={`${uiStyles.chip} ${s.clearAll}`}
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              FILTER_KEYS.forEach((k) => next.delete(k));
              push(next);
            }}
          >
            Clear all
          </button>
        </div>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter entries"
        footer={
          <>
            <Button onClick={() => setDraft({})}>Reset</Button>
            <Button variant="primary" onClick={apply}>
              Show entries
            </Button>
          </>
        }
      >
        <Field id="f-type" label="Type">
          <Select id="f-type" value={d("type")} onChange={(e) => setD("type", e.target.value)}>
            <option value="">Any type</option>
            {WINE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-country" label="Country">
          <Select id="f-country" value={d("country")} onChange={(e) => setD("country", e.target.value)}>
            <option value="">Any country</option>
            {(facets.countries.length ? facets.countries : COUNTRIES.map((c) => c.code)).map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-region" label="Region">
          <Select id="f-region" value={d("region")} onChange={(e) => setD("region", e.target.value)} disabled={!facets.regions.length}>
            <option value="">{facets.regions.length ? "Any region" : "No regions recorded yet"}</option>
            {facets.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-grape" label="Grape">
          <Select id="f-grape" value={d("grape")} onChange={(e) => setD("grape", e.target.value)} disabled={!facets.grapes.length}>
            <option value="">{facets.grapes.length ? "Any grape" : "No grapes recorded yet"}</option>
            {facets.grapes.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <div className={s.row2}>
          <Field id="f-min" label="Score from">
            <Input id="f-min" inputMode="decimal" value={d("min")} onChange={(e) => setD("min", e.target.value)} placeholder="0.0" />
          </Field>
          <Field id="f-max" label="Score to">
            <Input id="f-max" inputMode="decimal" value={d("max")} onChange={(e) => setD("max", e.target.value)} placeholder="10.0" />
          </Field>
        </div>
        <p className={s.sheetNote}>A score range only matches rated tastings.</p>
        <div className={s.row2}>
          <Field id="f-from" label="Tasted from">
            <Input id="f-from" type="date" value={d("from")} onChange={(e) => setD("from", e.target.value)} />
          </Field>
          <Field id="f-to" label="Tasted until">
            <Input id="f-to" type="date" value={d("to")} onChange={(e) => setD("to", e.target.value)} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
