import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { loadAnalyticsRows } from "@/server/analytics";
import { getRequestLocale } from "@/server/locale";
import { applyFilters, chronology, palateFingerprint, ratingDistribution, sampleStrength, valueLandscape, type AnalyticsFilters } from "@/lib/domain/analytics";
import { COUNTRIES, countryName } from "@/lib/domain/countries";
import { formatPrice, PRICE_BASES } from "@/lib/domain/currency";
import { formatScore } from "@/lib/domain/score";
import { WINE_TYPES, isWineType, wineTypeLabel } from "@/lib/domain/wine";
import { formatDate, formatMonth, formatNumber, plural } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink, EmptyState, Field, Input, Select, uiStyles } from "@/components/ui/primitives";
import { Caveat, chartStyles as s, DataTable, Figure, NotEnough, Panel } from "@/components/charts/ChartBits";
import { RatingChart } from "@/components/charts/RatingChart";
import { Fingerprint } from "@/components/charts/Fingerprint";
import { ValueChart } from "@/components/charts/ValueChart";
import { ChronologyChart } from "@/components/charts/ChronologyChart";

export const metadata: Metadata = { title: "Compendium" };

const strengthText = {
  none: "",
  anecdotal: "Fewer than five data points: treat this as anecdote, not pattern.",
  emerging: "A small sample: patterns may shift as you record more.",
  established: "",
} as const;

function str(v: string | string[] | undefined) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export default async function CompendiumPage({ searchParams }: PageProps<"/compendium">) {
  const user = await requireUser();
  const sp = await searchParams;
  const locale = await getRequestLocale();
  const all = await loadAnalyticsRows(user.id);

  if (all.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Analysis" title="Compendium" />
        <EmptyState mark="No records to analyse" title="Nothing to analyse yet" action={<ButtonLink href="/capture" variant="primary" icon="capture">Record a tasting</ButtonLink>}>
          The Compendium charts your rating distribution, palate fingerprint, price against enjoyment, and tasting chronology, all calculated from your
          own saved records. It stays empty until there is something real to show.
        </EmptyState>
      </>
    );
  }

  const type = str(sp.type);
  const filters: AnalyticsFilters = {
    wineType: type && isWineType(type) ? type : null,
    country: str(sp.country)?.match(/^[A-Z]{2}$/) ? str(sp.country) : null,
    from: str(sp.from)?.match(/^\d{4}-\d{2}-\d{2}$/) ? str(sp.from) : null,
    to: str(sp.to)?.match(/^\d{4}-\d{2}-\d{2}$/) ? str(sp.to) : null,
  };
  const rows = applyFilters(all, filters);
  const filtered = rows.length !== all.length || Boolean(filters.wineType || filters.country || filters.from || filters.to);
  const dist = ratingDistribution(rows);
  const finger = palateFingerprint(rows);
  const basis = str(sp.basis);
  const value = valueLandscape(rows, str(sp.currency), basis && PRICE_BASES.some((b) => b.value === basis) ? basis : null);
  const chrono = chronology(rows);
  const countries = [...new Set(all.map((r) => r.country).filter(Boolean))] as string[];
  const keep = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ type: filters.wineType, country: filters.country, from: filters.from, to: filters.to, currency: value.currency, basis: basis ?? null, ...extra })) if (v) p.set(k, v);
    return `/compendium?${p.toString()}`;
  };
  const assessedDims = finger.dimensions.filter((d) => d.assessed > 0);

  return (
    <>
      <PageHeader
        eyebrow="Analysis"
        title="Compendium"
        lede="Four views of your records. Every number is calculated directly from what you saved; nothing is estimated or filled in."
      />

      <form method="get" action="/compendium" className={s.filters} aria-label="Filter the analysis">
        <Field id="c-type" label="Type">
          <Select id="c-type" name="type" defaultValue={filters.wineType ?? ""}>
            <option value="">All types</option>
            {WINE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="c-country" label="Country">
          <Select id="c-country" name="country" defaultValue={filters.country ?? ""}>
            <option value="">All countries</option>
            {COUNTRIES.filter((c) => countries.includes(c.code)).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="c-from" label="From">
          <Input id="c-from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </Field>
        <Field id="c-to" label="Until">
          <Input id="c-to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </Field>
        <div className={s.filterActions}>
          <button type="submit" className={`${uiStyles.button} ${uiStyles.primary}`}>
            Apply
          </button>
          {filtered && (
            <Link href="/compendium" className={`${uiStyles.button} ${uiStyles.ghost}`}>
              Reset
            </Link>
          )}
        </div>
      </form>
      <p className={s.basis}>
        {filtered ? `${plural(rows.length, "tasting")} of ${all.length} match these filters.` : `Based on all ${plural(all.length, "tasting")}.`}
        {dist.unrated > 0 && ` ${dist.unrated} unrated ${dist.unrated === 1 ? "tasting is" : "tastings are"} excluded from score statistics.`}
      </p>

      {/* 1. Rating distribution */}
      <Panel id="ratings" index={1} title="Rating distribution" sub="How your personal scores spread across the scale, in one-point bands. Tap a column to see those tastings.">
        {dist.rated === 0 ? (
          <NotEnough>None of these tastings has a score yet. Unrated tastings are never counted as zero.</NotEnough>
        ) : (
          <>
            <div className={s.figures}>
              <Figure label="Rated" value={dist.rated} />
              <Figure label="Mean" value={formatNumber(dist.mean!, locale, 1)} />
              <Figure label="Median" value={formatNumber(dist.median!, locale, 1)} />
              <Figure label="Range" value={`${formatScore(dist.min)}–${formatScore(dist.max)}`} />
            </div>
            <RatingChart bins={dist.bins} />
            <p className={s.summary}>
              Of {plural(dist.rated, "rated tasting")}, the most common band is{" "}
              {(() => {
                const top = [...dist.bins].sort((a, b) => b.count - a.count || b.start - a.start)[0];
                return `${top.label} (${top.count})`;
              })()}
              . Your mean is {formatNumber(dist.mean!, locale, 1)} and median {formatNumber(dist.median!, locale, 1)}.
            </p>
            {strengthText[sampleStrength(dist.rated)] && <Caveat>{strengthText[sampleStrength(dist.rated)]}</Caveat>}
            <DataTable caption="Rated tastings per score band">
              <thead>
                <tr>
                  <th scope="col">Score band</th>
                  <th scope="col" className={s.num}>
                    Tastings
                  </th>
                </tr>
              </thead>
              <tbody>
                {dist.bins.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td className={s.num}>{b.count}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Caveat>Bands include their lower bound; the top band, 9–10, also includes 10.0.</Caveat>
          </>
        )}
      </Panel>

      {/* 2. Palate fingerprint */}
      <Panel id="palate" index={2} title="Palate fingerprint" sub="What you recorded about each wine's structure, and how you scored the wines at each level. Only observations you actually made are counted.">
        {assessedDims.length === 0 ? (
          <NotEnough>No structural observations recorded yet. Note body, acidity, sweetness, tannin or finish when you taste, and your fingerprint appears here.</NotEnough>
        ) : (
          <>
            <Fingerprint dimensions={finger.dimensions} />
            <p className={s.summary}>
              {assessedDims
                .map((d) => {
                  const top = [...d.levels].sort((a, b) => b.count - a.count)[0];
                  return `${d.label}: most often “${d.scale[top.value - 1].toLowerCase()}” (${top.count} of ${d.assessed})`;
                })
                .join(". ")}
              .
            </p>
            <Caveat>
              Mean scores are shown per level only for tastings that were rated. Dimensions marked unsure, none perceived or not applicable are counted separately and never treated as a value.
            </Caveat>
            <DataTable caption="Structural observations by level">
              <thead>
                <tr>
                  <th scope="col">Dimension</th>
                  <th scope="col" className={s.num}>Assessed</th>
                  <th scope="col" className={s.num}>Not assessed</th>
                  <th scope="col" className={s.num}>Unsure / none / n.a.</th>
                  <th scope="col">Levels (count · mean score)</th>
                </tr>
              </thead>
              <tbody>
                {finger.dimensions
                  .filter((d) => d.assessed + d.unknown + d.absent + d.notApplicable > 0)
                  .map((d) => (
                    <tr key={d.key}>
                      <td>{d.label}</td>
                      <td className={s.num}>{d.assessed}</td>
                      <td className={s.num}>{d.notAssessed}</td>
                      <td className={s.num}>
                        {d.unknown} / {d.absent} / {d.notApplicable}
                      </td>
                      <td>
                        {d.levels
                          .filter((l) => l.count)
                          .map((l) => `${d.scale[l.value - 1]}: ${l.count}${l.meanScore !== null ? ` · ${formatScore(l.meanScore)}` : ""}`)
                          .join("; ")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
          </>
        )}
        {finger.descriptors.length > 0 && (
          <div className={s.subsection}>
            <p className="eyebrow">Descriptors you reach for most</p>
            <div className={s.descriptorList}>
              {finger.descriptors.map((d) => (
                <Link key={d.descriptor} href={`/journal?ids=${d.tastingIds.join(",")}`} className={s.descriptorRow}>
                  <span className={s.descriptorName}>{d.descriptor}</span>
                  <span className={s.descriptorTrack} aria-hidden="true">
                    <span className={s.descriptorBar} style={{ display: "block", width: `${(d.count / finger.descriptors[0].count) * 100}%` }} />
                  </span>
                  <span className={s.descriptorCount}>{d.count}×</span>
                  <span className={s.descriptorMean}>
                    {d.meanScore === null ? <span className="muted">unrated</span> : `avg ${formatScore(d.meanScore)}`}
                  </span>
                </Link>
              ))}
            </div>
            <Caveat>Counts are tastings in which you noted the descriptor (on the nose or palate). Averages use only rated tastings.</Caveat>
          </div>
        )}
      </Panel>

      {/* 3. Value landscape */}
      <Panel id="value" index={3} title="Price and enjoyment" sub="Your score against the price you actually paid. Prices are compared only within one currency and are never converted or estimated.">
        {value.currencies.length === 0 ? (
          <NotEnough>
            No tastings here have both a price and a score. Add the price you paid when recording, and this chart will show where enjoyment and price part ways.
            {value.excluded.noScore > 0 && ` (${plural(value.excluded.noScore, "priced tasting")} still ${value.excluded.noScore === 1 ? "needs" : "need"} a score.)`}
          </NotEnough>
        ) : (
          <>
            <div className={s.selectors}>
              {value.currencies.length > 1 && (
                <div className={s.chips} role="group" aria-label="Currency">
                  {value.currencies.map((c) => (
                    <Link key={c.currency} href={keep({ currency: c.currency })} className={uiStyles.chip} aria-pressed={c.currency === value.currency} replace scroll={false}>
                      {c.currency} · {c.count}
                    </Link>
                  ))}
                </div>
              )}
              <div className={s.chips} role="group" aria-label="Price basis">
                <Link href={keep({ basis: null })} className={uiStyles.chip} aria-pressed={!basis} replace scroll={false}>
                  All prices
                </Link>
                {PRICE_BASES.map((b) => (
                  <Link key={b.value} href={keep({ basis: b.value })} className={uiStyles.chip} aria-pressed={basis === b.value} replace scroll={false}>
                    {b.label}
                  </Link>
                ))}
              </div>
            </div>
            {value.points.length === 0 ? (
              <NotEnough>No priced, rated tastings for this selection.</NotEnough>
            ) : (
              <>
                <div className={s.figures}>
                  <Figure label={`Plotted (${value.currency})`} value={value.points.length} />
                  {value.medianPrice !== null && <Figure label="Median price" value={formatPrice(value.medianPrice, value.currency, locale)} />}
                  {value.medianScore !== null && <Figure label="Median score" value={formatNumber(value.medianScore, locale, 1)} />}
                </div>
                <ValueChart points={value.points} currency={value.currency!} medianPrice={value.medianPrice} medianScore={value.medianScore} />
                <p className={s.summary}>
                  {value.points.length} tastings priced in {value.currency}.{" "}
                  {value.excluded.noPrice > 0 && `${value.excluded.noPrice} without a price, `}
                  {value.excluded.noScore > 0 && `${value.excluded.noScore} priced but unrated, `}
                  {value.excluded.otherCurrency > 0 && `${value.excluded.otherCurrency} in other currencies `}
                  {value.excluded.noPrice + value.excluded.noScore + value.excluded.otherCurrency > 0 && "are not shown."}
                </p>
                {basis === null || basis === undefined ? (
                  <Caveat>Bottle and by-the-glass prices aren&rsquo;t directly comparable; marker shape shows which is which, or choose one basis above.</Caveat>
                ) : null}
                {strengthText[sampleStrength(value.points.length)] && <Caveat>{strengthText[sampleStrength(value.points.length)]}</Caveat>}
                {value.discoveries.length > 0 && (
                  <div className={s.subsection}>
                    <p className="eyebrow">Value discoveries · scored 8.0+ at or below your median price</p>
                    <div className={s.discoveries}>
                      {value.discoveries.map((d) => (
                        <Link key={d.id} href={`/wines/${d.wineId}#tasting-${d.id}`} className={s.discovery}>
                          <span className={s.discoveryName}>{d.label}</span>
                          <span className={s.discoveryFig}>
                            {formatScore(d.score)} · {formatPrice(d.price, value.currency, locale)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <DataTable caption="Price and score for each plotted tasting">
                  <thead>
                    <tr>
                      <th scope="col">Wine</th>
                      <th scope="col">Basis</th>
                      <th scope="col" className={s.num}>Price</th>
                      <th scope="col" className={s.num}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...value.points]
                      .sort((a, b) => a.price - b.price)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/wines/${p.wineId}#tasting-${p.id}`}>{p.label}</Link>
                          </td>
                          <td>{PRICE_BASES.find((b) => b.value === p.basis)?.label ?? "–"}</td>
                          <td className={s.num}>{formatPrice(p.price, value.currency, locale)}</td>
                          <td className={s.num}>{formatScore(p.score)}</td>
                        </tr>
                      ))}
                  </tbody>
                </DataTable>
              </>
            )}
          </>
        )}
      </Panel>

      {/* 4. Chronology */}
      <Panel id="chronology" index={4} title="Tasting chronology" sub="When you tasted and how you scored, by actual tasting date. Tap a point to open that tasting.">
        {chrono.points.length === 0 ? (
          <NotEnough>No tastings match these filters.</NotEnough>
        ) : (
          <>
            <div className={s.figures}>
              <Figure label="First" value={formatDate(chrono.first!, locale)} />
              <Figure label="Latest" value={formatDate(chrono.last!, locale)} />
              <Figure label="Months active" value={`${chrono.months.filter((m) => m.count).length} of ${chrono.months.length}`} />
            </div>
            <ChronologyChart data={chrono} />
            <p className={s.summary}>
              {plural(chrono.points.length, "tasting")} between {formatDate(chrono.first!, locale)} and {formatDate(chrono.last!, locale)}; the busiest month was{" "}
              {(() => {
                const m = [...chrono.months].sort((a, b) => b.count - a.count)[0];
                return `${formatMonth(m.month, locale)} (${m.count})`;
              })()}
              . Unrated tastings appear in the monthly counts but not on the score chart.
            </p>
            <DataTable caption="Tastings and mean score by month">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className={s.num}>Tastings</th>
                  <th scope="col" className={s.num}>Rated</th>
                  <th scope="col" className={s.num}>Mean score</th>
                </tr>
              </thead>
              <tbody>
                {chrono.months
                  .filter((m) => m.count > 0)
                  .map((m) => (
                    <tr key={m.month}>
                      <td>{formatMonth(m.month, locale)}</td>
                      <td className={s.num}>{m.count}</td>
                      <td className={s.num}>{m.rated}</td>
                      <td className={s.num}>{m.meanScore === null ? "–" : formatScore(m.meanScore)}</td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
          </>
        )}
      </Panel>
      <p className={s.colophon}>
        {filtered && `Filtered to ${[filters.wineType && wineTypeLabel(filters.wineType), filters.country && countryName(filters.country), filters.from && `from ${filters.from}`, filters.to && `until ${filters.to}`].filter(Boolean).join(", ")}. `}
        Calculations: means and medians use rated tastings only; medians of an even count average the middle two values.
      </p>
    </>
  );
}
